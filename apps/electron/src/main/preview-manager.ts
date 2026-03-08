/**
 * Preview runtime manager for coding-workspace sessions.
 */

import type { WorkspaceSessionDescriptor, WorkspaceSessionState } from '../shared/workspace-session'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { access, constants } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatCommandFailure } from './command-errors'

const DEFAULT_PREVIEW_HOST = '127.0.0.1'
const DEFAULT_PREVIEW_BASE_PORT = 4310
const DEFAULT_KEEP_WARM_COUNT = 2
const DEFAULT_READY_TIMEOUT_MS = 30_000
const DEFAULT_HEALTH_INTERVAL_MS = 5_000
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PREVIEW_SOURCE_REPO_ROOT = resolve(__dirname, '../../../..')

export type PreviewRuntimeState = 'stopped' | 'starting' | 'ready' | 'error'

export type PreviewRuntimeStatus = {
  sessionId: string
  state: PreviewRuntimeState
  port?: number
  url?: string
  startedAt?: number
  lastError?: string
  lastOutput?: string
}

type PreviewRuntime = {
  descriptor: WorkspaceSessionDescriptor
  process: ChildProcessWithoutNullStreams | null
  port: number
  state: PreviewRuntimeState
  url: string
  startedAt: number | null
  lastError: string | null
  lastOutput: string | null
  stopRequested: boolean
  healthTimer: ReturnType<typeof setInterval> | null
  readinessTask: Promise<void> | null
}

type PreviewManagerOptions = {
  host?: string
  basePort?: number
  keepWarmCount?: number
  readyTimeoutMs?: number
  healthIntervalMs?: number
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await Promise.race<T>([
      task,
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('Timed out waiting for preview runtime'))
        })
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer()

    server.once('error', () => {
      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, host)
  })
}

async function findAvailableManagedPort(
  host: string,
  startPort: number,
  claimedPorts: ReadonlySet<number>
): Promise<number> {
  let port = startPort

  while (claimedPorts.has(port) || !(await isPortAvailable(host, port))) {
    port += 1
  }

  return port
}

async function probePreviewUrl(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeOutput(data: string): string | null {
  const lines = data
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.at(-1) ?? null
}

export function buildKeepWarmSessionIds(
  sessions: readonly WorkspaceSessionDescriptor[],
  keepWarmCount: number = DEFAULT_KEEP_WARM_COUNT
): Set<string> {
  return new Set(sessions.slice(0, Math.max(0, keepWarmCount)).map((session) => session.sessionId))
}

export function previewRuntimeToWorkspaceState(
  status: PreviewRuntimeStatus
): WorkspaceSessionState {
  switch (status.state) {
    case 'ready':
      return 'previewing'
    case 'starting':
      return 'running'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

export class PreviewManager {
  private readonly events = new EventEmitter()
  private readonly runtimes = new Map<string, PreviewRuntime>()
  private readonly reservedPorts = new Map<string, number>()
  private readonly host: string
  private readonly basePort: number
  private readonly keepWarmCount: number
  private readonly readyTimeoutMs: number
  private readonly healthIntervalMs: number

  constructor(options: PreviewManagerOptions = {}) {
    this.host = options.host ?? DEFAULT_PREVIEW_HOST
    this.basePort = options.basePort ?? DEFAULT_PREVIEW_BASE_PORT
    this.keepWarmCount = options.keepWarmCount ?? DEFAULT_KEEP_WARM_COUNT
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS
    this.healthIntervalMs = options.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS
  }

  onStatus(listener: (status: PreviewRuntimeStatus) => void): () => void {
    this.events.on('status', listener)
    return () => {
      this.events.off('status', listener)
    }
  }

  getStatus(sessionId: string): PreviewRuntimeStatus {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) {
      return {
        sessionId,
        state: 'stopped'
      }
    }

    return {
      sessionId,
      state: runtime.state,
      port: runtime.port,
      url: runtime.url,
      ...(runtime.startedAt ? { startedAt: runtime.startedAt } : {}),
      ...(runtime.lastError ? { lastError: runtime.lastError } : {}),
      ...(runtime.lastOutput ? { lastOutput: runtime.lastOutput } : {})
    }
  }

  async syncSessions(sessions: readonly WorkspaceSessionDescriptor[]): Promise<void> {
    const keepWarmSessionIds = buildKeepWarmSessionIds(sessions, this.keepWarmCount)

    await Promise.all(
      sessions.map(async (session) => {
        if (keepWarmSessionIds.has(session.sessionId)) {
          await this.ensureSession(session)
          return
        }

        await this.stopSession(session.sessionId)
      })
    )

    const knownSessionIds = new Set(sessions.map((session) => session.sessionId))
    const staleSessionIds = [...this.runtimes.keys()].filter(
      (sessionId) => !knownSessionIds.has(sessionId)
    )
    await Promise.all(staleSessionIds.map((sessionId) => this.stopSession(sessionId)))
  }

  async ensureSession(session: WorkspaceSessionDescriptor): Promise<PreviewRuntimeStatus> {
    const existingRuntime = this.runtimes.get(session.sessionId)
    if (existingRuntime) {
      existingRuntime.descriptor = session
      if (existingRuntime.state === 'ready' || existingRuntime.state === 'starting') {
        return this.getStatus(session.sessionId)
      }

      await this.stopSession(session.sessionId)
    }

    return this.startSession(session)
  }

  async refreshSession(session: WorkspaceSessionDescriptor): Promise<PreviewRuntimeStatus> {
    const runtime = this.runtimes.get(session.sessionId)
    if (!runtime) {
      return this.ensureSession(session)
    }

    runtime.descriptor = session
    const healthy = await probePreviewUrl(runtime.url)
    if (healthy) {
      if (runtime.state !== 'ready') {
        runtime.state = 'ready'
        runtime.lastError = null
        if (!runtime.startedAt) {
          runtime.startedAt = Date.now()
        }
        this.emitStatus(session.sessionId)
      }
      return this.getStatus(session.sessionId)
    }

    return this.restartSession(session)
  }

  async restartSession(session: WorkspaceSessionDescriptor): Promise<PreviewRuntimeStatus> {
    await this.stopSession(session.sessionId)
    return this.startSession(session)
  }

  async stopSession(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) {
      return
    }

    runtime.stopRequested = true
    if (runtime.healthTimer) {
      clearInterval(runtime.healthTimer)
      runtime.healthTimer = null
    }

    const child = runtime.process
    if (!child) {
      this.runtimes.delete(sessionId)
      this.emitStatus(sessionId)
      return
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
      }, 4000)

      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      child.kill('SIGTERM')
    })
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runtimes.keys()].map((sessionId) => this.stopSession(sessionId)))
  }

  private async startSession(session: WorkspaceSessionDescriptor): Promise<PreviewRuntimeStatus> {
    const port = await this.allocatePort(session.sessionId)
    const previewAppPath = join(session.worktreePath, 'apps', 'web')
    const previewAppExists = await fileExists(previewAppPath)
    if (!previewAppExists) {
      const runtime = this.createRuntime(session, port)
      this.releaseReservedPort(session.sessionId)
      runtime.state = 'error'
      runtime.lastError = `Preview app not found at ${previewAppPath}`
      this.runtimes.set(session.sessionId, runtime)
      this.emitStatus(session.sessionId)
      return this.getStatus(session.sessionId)
    }

    const runtime = this.createRuntime(session, port)
    this.releaseReservedPort(session.sessionId)
    this.runtimes.set(session.sessionId, runtime)
    this.emitStatus(session.sessionId)

    try {
      const child = spawn(
        'pnpm',
        ['exec', 'vite', '--host', this.host, '--port', String(port), '--strictPort'],
        {
          cwd: previewAppPath,
          env: {
            ...process.env,
            BROWSER: 'none',
            CI: '1',
            FORCE_COLOR: '0',
            XNET_PREVIEW_SOURCE_REPO_ROOT:
              process.env.XNET_PREVIEW_SOURCE_REPO_ROOT ?? PREVIEW_SOURCE_REPO_ROOT
          }
        }
      )

      runtime.process = child

      child.stdout.on('data', (chunk: Buffer) => {
        const nextOutput = normalizeOutput(chunk.toString())
        if (nextOutput) {
          runtime.lastOutput = nextOutput
        }
      })

      child.stderr.on('data', (chunk: Buffer) => {
        const nextOutput = normalizeOutput(chunk.toString())
        if (nextOutput) {
          runtime.lastOutput = nextOutput
          runtime.lastError = nextOutput
        }
      })

      child.once('error', (error) => {
        runtime.state = 'error'
        runtime.lastError = formatCommandFailure(
          'pnpm',
          ['exec', 'vite', '--host', this.host, '--port', String(port), '--strictPort'],
          previewAppPath,
          error
        )
        this.emitStatus(session.sessionId)
      })

      child.once('exit', (_code, signal) => {
        if (runtime.healthTimer) {
          clearInterval(runtime.healthTimer)
          runtime.healthTimer = null
        }

        if (runtime.stopRequested) {
          this.runtimes.delete(session.sessionId)
          this.emitStatus(session.sessionId)
          return
        }

        runtime.state = 'error'
        runtime.lastError = signal
          ? `Preview runtime exited with signal ${signal}`
          : 'Preview runtime exited unexpectedly'
        runtime.process = null
        this.emitStatus(session.sessionId)
      })

      runtime.readinessTask = withTimeout(this.waitForReady(runtime), this.readyTimeoutMs)
      await runtime.readinessTask

      if (runtime.state !== 'error') {
        runtime.state = 'ready'
        runtime.startedAt = Date.now()
        runtime.lastError = null
        this.startHealthChecks(runtime)
        this.emitStatus(session.sessionId)
      }
    } catch (error) {
      if (runtime.process) {
        runtime.process.kill('SIGKILL')
      }
      runtime.state = 'error'
      runtime.lastError = formatCommandFailure(
        'pnpm',
        ['exec', 'vite', '--host', this.host, '--port', String(port), '--strictPort'],
        previewAppPath,
        error
      )
      this.emitStatus(session.sessionId)
    }

    return this.getStatus(session.sessionId)
  }

  private createRuntime(session: WorkspaceSessionDescriptor, port: number): PreviewRuntime {
    return {
      descriptor: session,
      process: null,
      port,
      state: 'starting',
      url: `http://${this.host}:${String(port)}`,
      startedAt: null,
      lastError: null,
      lastOutput: null,
      stopRequested: false,
      healthTimer: null,
      readinessTask: null
    }
  }

  private async allocatePort(sessionId: string): Promise<number> {
    const existingRuntime = this.runtimes.get(sessionId)
    if (existingRuntime) {
      return existingRuntime.port
    }

    const existingReservation = this.reservedPorts.get(sessionId)
    if (existingReservation) {
      return existingReservation
    }

    const claimedPorts = new Set<number>([
      ...this.reservedPorts.values(),
      ...[...this.runtimes.values()].map((runtime) => runtime.port)
    ])
    const nextPort = await findAvailableManagedPort(this.host, this.basePort, claimedPorts)
    this.reservedPorts.set(sessionId, nextPort)
    return nextPort
  }

  private releaseReservedPort(sessionId: string): void {
    this.reservedPorts.delete(sessionId)
  }

  private async waitForReady(runtime: PreviewRuntime): Promise<void> {
    while (runtime.state === 'starting' && !runtime.stopRequested) {
      if (await probePreviewUrl(runtime.url)) {
        return
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 300)
      })
    }
  }

  private startHealthChecks(runtime: PreviewRuntime): void {
    if (runtime.healthTimer) {
      clearInterval(runtime.healthTimer)
    }

    runtime.healthTimer = setInterval(() => {
      void probePreviewUrl(runtime.url).then((healthy) => {
        if (!healthy && runtime.state === 'ready') {
          runtime.state = 'error'
          runtime.lastError = runtime.lastError ?? 'Preview runtime stopped responding'
          this.emitStatus(runtime.descriptor.sessionId)
        }
      })
    }, this.healthIntervalMs)
  }

  private emitStatus(sessionId: string): void {
    this.events.emit('status', this.getStatus(sessionId))
  }
}

export function createPreviewManager(options: PreviewManagerOptions = {}): PreviewManager {
  return new PreviewManager(options)
}
