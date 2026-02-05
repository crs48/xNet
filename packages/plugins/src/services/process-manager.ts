/**
 * Process Manager
 *
 * Manages background service processes. This module is designed to run in
 * Electron's main process or Node.js environment.
 *
 * Note: In browser environments, this will not work directly - use the
 * ServiceClient with IPC to communicate with the main process.
 */

import type {
  ServiceDefinition,
  ServiceStatus,
  ServiceState,
  ServiceStatusEvent,
  ServiceOutputEvent,
  IProcessManager,
  ProcessManagerEvents
} from './types'

// ─── Type Guards ─────────────────────────────────────────────────────────────

/**
 * Check if we're in a Node.js environment with child_process available
 */
function isNodeEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions !== 'undefined' &&
    typeof process.versions.node !== 'undefined'
  )
}

// ─── Managed Process ─────────────────────────────────────────────────────────

/**
 * Manages a single service process
 */
class ManagedProcess {
  private process: import('child_process').ChildProcess | null = null
  private status: ServiceStatus
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private listeners: {
    status: ((event: ServiceStatusEvent) => void)[]
    output: ((event: ServiceOutputEvent) => void)[]
  } = { status: [], output: [] }

  constructor(private definition: ServiceDefinition) {
    this.status = {
      id: definition.id,
      state: 'stopped',
      restartCount: 0
    }
  }

  /**
   * Start the service process
   */
  async start(): Promise<ServiceStatus> {
    if (this.status.state === 'running' || this.status.state === 'starting') {
      return this.status
    }

    if (!isNodeEnvironment()) {
      throw new Error('ProcessManager can only run in Node.js environment')
    }

    const { spawn } = await import('child_process')

    this.updateState('starting')

    const { command, args = [], cwd, env, shell } = this.definition.process
    const { protocol } = this.definition.communication

    try {
      this.process = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: shell ?? false,
        stdio: protocol === 'stdio' ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
      })

      this.status.pid = this.process.pid

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        this.emitOutput('stdout', data.toString())
      })

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        this.emitOutput('stderr', data.toString())
      })

      // Handle exit
      this.process.on('exit', (code, signal) => {
        this.handleExit(code, signal)
      })

      // Handle errors
      this.process.on('error', (err) => {
        this.status.lastError = err.message
        this.updateState('error')
      })

      // Wait for health check or startup delay
      await this.waitForHealthy()

      this.updateState('running')
      this.status.startedAt = Date.now()

      // Start continuous health checking if configured
      this.startHealthCheck()

      return this.getStatus()
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : String(err)
      this.updateState('error')
      throw err
    }
  }

  /**
   * Stop the service process
   */
  async stop(): Promise<void> {
    if (this.status.state === 'stopped' || this.status.state === 'stopping') {
      return
    }

    this.updateState('stopping')
    this.clearTimers()

    if (!this.process) {
      this.updateState('stopped')
      return
    }

    const shutdownTimeout = this.definition.lifecycle.shutdownTimeoutMs ?? 5000

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill after timeout
        this.process?.kill('SIGKILL')
        this.process = null
        this.updateState('stopped')
        resolve()
      }, shutdownTimeout)

      this.process!.on('exit', () => {
        clearTimeout(timeout)
        this.process = null
        this.updateState('stopped')
        resolve()
      })

      // Send graceful shutdown signal
      this.process!.kill('SIGTERM')
    })
  }

  /**
   * Get current status
   */
  getStatus(): ServiceStatus {
    const status = { ...this.status }
    if (status.state === 'running' && status.startedAt) {
      status.uptime = Date.now() - status.startedAt
    }
    return status
  }

  /**
   * Subscribe to status changes
   */
  onStatus(callback: (event: ServiceStatusEvent) => void): () => void {
    this.listeners.status.push(callback)
    return () => {
      const idx = this.listeners.status.indexOf(callback)
      if (idx >= 0) this.listeners.status.splice(idx, 1)
    }
  }

  /**
   * Subscribe to output events
   */
  onOutput(callback: (event: ServiceOutputEvent) => void): () => void {
    this.listeners.output.push(callback)
    return () => {
      const idx = this.listeners.output.indexOf(callback)
      if (idx >= 0) this.listeners.output.splice(idx, 1)
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private updateState(state: ServiceState): void {
    const previousState = this.status.state
    this.status.state = state

    const event: ServiceStatusEvent = {
      serviceId: this.definition.id,
      status: this.getStatus(),
      previousState
    }

    for (const listener of this.listeners.status) {
      try {
        listener(event)
      } catch (err) {
        console.error('[ManagedProcess] Status listener error:', err)
      }
    }
  }

  private emitOutput(stream: 'stdout' | 'stderr', data: string): void {
    const event: ServiceOutputEvent = {
      serviceId: this.definition.id,
      stream,
      data,
      timestamp: Date.now()
    }

    for (const listener of this.listeners.output) {
      try {
        listener(event)
      } catch (err) {
        console.error('[ManagedProcess] Output listener error:', err)
      }
    }
  }

  private handleExit(code: number | null, signal: string | null): void {
    if (this.status.state === 'stopping') {
      return // Intentional stop
    }

    const { restart, maxRestarts = 5, restartDelayMs = 1000 } = this.definition.lifecycle

    const shouldRestart = restart === 'always' || (restart === 'on-failure' && code !== 0)

    if (shouldRestart && this.status.restartCount < maxRestarts) {
      this.status.restartCount++
      this.status.lastError = `Exited with code ${code}, signal ${signal}. Restarting...`
      this.updateState('starting')

      this.restartTimer = setTimeout(() => {
        this.start().catch((err) => {
          console.error(`[ManagedProcess] Restart failed for ${this.definition.id}:`, err)
        })
      }, restartDelayMs)
    } else {
      this.status.lastError = `Exited with code ${code}, signal ${signal}`
      this.updateState('error')
    }
  }

  private async waitForHealthy(): Promise<void> {
    const { healthCheck, startTimeoutMs = 10000 } = this.definition.lifecycle
    const start = Date.now()

    while (Date.now() - start < startTimeoutMs) {
      if (!healthCheck) {
        // No health check - wait a short delay
        await this.delay(500)
        return
      }

      const healthy = await this.checkHealth()
      if (healthy) return

      await this.delay(500)
    }

    throw new Error(`Service '${this.definition.id}' health check timed out`)
  }

  private async checkHealth(): Promise<boolean> {
    const { healthCheck } = this.definition.lifecycle
    if (!healthCheck) return true

    try {
      switch (healthCheck.type) {
        case 'http': {
          if (!healthCheck.url) return false
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), healthCheck.timeoutMs ?? 5000)
          try {
            const res = await fetch(healthCheck.url, { signal: controller.signal })
            return res.ok
          } finally {
            clearTimeout(timeout)
          }
        }

        case 'tcp': {
          const port = healthCheck.port ?? this.definition.communication.port
          if (!port) return false
          const { createConnection } = await import('net')
          return new Promise<boolean>((resolve) => {
            const socket = createConnection(
              { port, host: this.definition.communication.host ?? '127.0.0.1' },
              () => {
                socket.destroy()
                resolve(true)
              }
            )
            socket.on('error', () => resolve(false))
            socket.setTimeout(healthCheck.timeoutMs ?? 5000, () => {
              socket.destroy()
              resolve(false)
            })
          })
        }

        case 'stdout': {
          // Stdout pattern matching is handled via output events
          // For startup, we just check if process is alive
          return this.process?.pid !== undefined
        }

        default:
          return false
      }
    } catch {
      return false
    }
  }

  private startHealthCheck(): void {
    const { healthCheck } = this.definition.lifecycle
    if (!healthCheck || !healthCheck.intervalMs) return

    this.healthCheckTimer = setInterval(async () => {
      if (this.status.state !== 'running') return

      const healthy = await this.checkHealth()
      if (!healthy) {
        this.status.lastError = 'Health check failed'
        // Don't immediately transition to error - give it a chance
        // The process exit handler will handle restarts
      }
    }, healthCheck.intervalMs)
  }

  private clearTimers(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// ─── Process Manager ─────────────────────────────────────────────────────────

/**
 * Manages multiple service processes
 *
 * @example
 * ```typescript
 * const manager = new ProcessManager()
 *
 * await manager.start({
 *   id: 'ollama',
 *   name: 'Ollama',
 *   process: { command: 'ollama', args: ['serve'] },
 *   lifecycle: { restart: 'on-failure' },
 *   communication: { protocol: 'http', port: 11434 }
 * })
 *
 * manager.on('service:status', (event) => {
 *   console.log(`${event.serviceId}: ${event.status.state}`)
 * })
 * ```
 */
export class ProcessManager implements IProcessManager {
  private processes = new Map<string, ManagedProcess>()
  private listeners: {
    [K in keyof ProcessManagerEvents]: ProcessManagerEvents[K][]
  } = {
    'service:status': [],
    'service:output': [],
    'service:error': []
  }

  /**
   * Start a service
   */
  async start(definition: ServiceDefinition): Promise<ServiceStatus> {
    if (this.processes.has(definition.id)) {
      throw new Error(`Service '${definition.id}' is already registered`)
    }

    const managed = new ManagedProcess(definition)
    this.processes.set(definition.id, managed)

    // Forward events
    managed.onStatus((event) => {
      this.emit('service:status', event)
    })
    managed.onOutput((event) => {
      this.emit('service:output', event)
    })

    try {
      return await managed.start()
    } catch (err) {
      this.emit('service:error', {
        serviceId: definition.id,
        error: err instanceof Error ? err : new Error(String(err))
      })
      throw err
    }
  }

  /**
   * Stop a service
   */
  async stop(serviceId: string): Promise<void> {
    const managed = this.processes.get(serviceId)
    if (!managed) return

    await managed.stop()
    this.processes.delete(serviceId)
  }

  /**
   * Restart a service
   */
  async restart(serviceId: string): Promise<ServiceStatus> {
    const managed = this.processes.get(serviceId)
    if (!managed) {
      throw new Error(`Service '${serviceId}' not found`)
    }

    await managed.stop()
    return managed.start()
  }

  /**
   * Get service status
   */
  getStatus(serviceId: string): ServiceStatus | undefined {
    return this.processes.get(serviceId)?.getStatus()
  }

  /**
   * Get all service statuses
   */
  getAllStatuses(): ServiceStatus[] {
    return [...this.processes.values()].map((p) => p.getStatus())
  }

  /**
   * Stop all services
   */
  async stopAll(): Promise<void> {
    await Promise.all([...this.processes.keys()].map((id) => this.stop(id)))
  }

  /**
   * Subscribe to events
   */
  on<K extends keyof ProcessManagerEvents>(event: K, listener: ProcessManagerEvents[K]): void {
    this.listeners[event].push(listener as never)
  }

  /**
   * Unsubscribe from events
   */
  off<K extends keyof ProcessManagerEvents>(event: K, listener: ProcessManagerEvents[K]): void {
    const listeners = this.listeners[event] as ProcessManagerEvents[K][]
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  }

  private emit<K extends keyof ProcessManagerEvents>(
    event: K,
    ...args: Parameters<ProcessManagerEvents[K]>
  ): void {
    const listeners = this.listeners[event] as ProcessManagerEvents[K][]
    for (const listener of listeners) {
      try {
        ;(listener as (...args: unknown[]) => void)(...args)
      } catch (err) {
        console.error(`[ProcessManager] Event listener error for '${event}':`, err)
      }
    }
  }
}
