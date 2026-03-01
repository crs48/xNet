/**
 * Cloudflare tunnel lifecycle manager for Electron.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export type TunnelMode = 'temporary' | 'persistent'
export type TunnelHealth = 'starting' | 'ready' | 'degraded' | 'stopped'

export type TunnelStartOptions = {
  mode?: TunnelMode
  targetUrl?: string
  tunnelName?: string
  hostname?: string
  token?: string
}

export type TunnelStatus = {
  health: TunnelHealth
  mode: TunnelMode | null
  endpoint: string | null
  pid: number | null
  startedAt: number | null
  message: string | null
}

type PersistedTunnelState = {
  endpoint: string | null
  mode: TunnelMode | null
  updatedAt: number
}

const DEFAULT_TARGET_URL = process.env.XNET_TUNNEL_TARGET_URL ?? 'http://127.0.0.1:4444'
const READY_LOG_RE =
  /registered tunnel connection|connection .* registered|your quick tunnel has been created/i
const ENDPOINT_RE = /https:\/\/[A-Za-z0-9.-]+\.(?:trycloudflare\.com|cfargotunnel\.com)/g

function getCloudflaredInstallHint(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Install with: brew install cloudflared'
    case 'win32':
      return 'Install with: winget install Cloudflare.cloudflared'
    case 'linux':
      return 'Install with: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared'
    default:
      return 'Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/'
  }
}

function getStateFilePath(): string {
  return join(app.getPath('userData'), 'xnet-data', 'cloudflare-tunnel-state.json')
}

export function parseEndpointFromLogLine(line: string): string | null {
  const matches = line.match(ENDPOINT_RE)
  if (!matches || matches.length === 0) {
    return null
  }

  for (const match of matches) {
    try {
      const url = new URL(match)
      if (
        !url.hostname.endsWith('.trycloudflare.com') &&
        !url.hostname.endsWith('.cfargotunnel.com')
      ) {
        continue
      }
      return `${url.protocol}//${url.host}`
    } catch {
      // Ignore malformed URLs in noisy logs.
    }
  }

  return null
}

export function buildCloudflaredArgs(options: TunnelStartOptions): string[] {
  const mode = options.mode ?? 'temporary'
  const targetUrl = options.targetUrl ?? DEFAULT_TARGET_URL

  if (mode === 'temporary') {
    return ['tunnel', '--no-autoupdate', '--url', targetUrl]
  }

  if (options.token) {
    return ['tunnel', '--no-autoupdate', 'run', '--token', options.token]
  }

  if (options.tunnelName) {
    return ['tunnel', '--no-autoupdate', 'run', options.tunnelName]
  }

  if (options.hostname) {
    return ['tunnel', '--no-autoupdate', '--url', targetUrl, '--hostname', options.hostname]
  }

  throw new Error('Persistent tunnel requires token, tunnelName, or hostname')
}

class CloudflareTunnelManager {
  private process: ChildProcessWithoutNullStreams | null = null
  private status: TunnelStatus = {
    health: 'stopped',
    mode: null,
    endpoint: null,
    pid: null,
    startedAt: null,
    message: null
  }
  private readonly events = new EventEmitter()
  private stopping = false

  constructor() {
    this.loadPersistedState()
  }

  getStatus(): TunnelStatus {
    return { ...this.status }
  }

  onStatus(listener: (status: TunnelStatus) => void): () => void {
    this.events.on('status', listener)
    listener(this.getStatus())
    return () => {
      this.events.off('status', listener)
    }
  }

  async start(options: TunnelStartOptions = {}): Promise<TunnelStatus> {
    if (this.process) {
      return this.getStatus()
    }

    this.stopping = false
    const mode = options.mode ?? 'temporary'
    const args = buildCloudflaredArgs(options)
    const targetEndpoint =
      mode === 'persistent' && options.hostname ? `https://${options.hostname}` : null

    this.setStatus({
      health: 'starting',
      mode,
      endpoint: targetEndpoint,
      pid: null,
      startedAt: Date.now(),
      message: 'Starting Cloudflare tunnel'
    })

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn('cloudflared', args, {
        env: process.env
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setStatus({
        health: 'degraded',
        mode,
        endpoint: null,
        pid: null,
        startedAt: null,
        message: `Failed to spawn cloudflared: ${message}. ${getCloudflaredInstallHint()}`
      })
      return this.getStatus()
    }

    const spawnError = await new Promise<Error | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 100)
      child.once('error', (err) => {
        clearTimeout(timeout)
        resolve(err)
      })
    })

    if (spawnError) {
      this.setStatus({
        health: 'degraded',
        mode,
        endpoint: null,
        pid: null,
        startedAt: null,
        message: `cloudflared not found. ${getCloudflaredInstallHint()}`
      })
      return this.getStatus()
    }

    this.process = child
    this.setStatus({
      ...this.status,
      pid: child.pid ?? null
    })

    const handleLogChunk = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      const lines = text.split('\n')
      for (const line of lines) {
        if (!line.trim()) {
          continue
        }

        const endpoint = parseEndpointFromLogLine(line)
        if (endpoint && endpoint !== this.status.endpoint) {
          this.setStatus({
            ...this.status,
            endpoint,
            health: 'ready',
            message: 'Cloudflare tunnel ready'
          })
          continue
        }

        if (READY_LOG_RE.test(line)) {
          this.setStatus({
            ...this.status,
            health: 'ready',
            message: 'Cloudflare tunnel ready'
          })
        }
      }
    }

    child.stdout.on('data', handleLogChunk)
    child.stderr.on('data', handleLogChunk)
    child.on('error', (error) => {
      this.setStatus({
        ...this.status,
        health: 'degraded',
        message: error.message
      })
    })
    child.on('exit', (code, signal) => {
      this.process = null
      if (this.stopping) {
        this.setStatus({
          health: 'stopped',
          mode: this.status.mode,
          endpoint: this.status.endpoint,
          pid: null,
          startedAt: null,
          message: 'Cloudflare tunnel stopped'
        })
        return
      }

      this.setStatus({
        health: 'degraded',
        mode: this.status.mode,
        endpoint: this.status.endpoint,
        pid: null,
        startedAt: null,
        message: `cloudflared exited (${code ?? 'unknown'}${signal ? `/${signal}` : ''})`
      })
    })

    return this.getStatus()
  }

  async stop(): Promise<TunnelStatus> {
    if (!this.process) {
      this.setStatus({
        ...this.status,
        health: 'stopped',
        pid: null,
        startedAt: null,
        message: 'Cloudflare tunnel stopped'
      })
      return this.getStatus()
    }

    this.stopping = true

    await new Promise<void>((resolve) => {
      const child = this.process
      if (!child) {
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 2000)

      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      child.kill('SIGTERM')
    })

    this.process = null
    this.setStatus({
      ...this.status,
      health: 'stopped',
      pid: null,
      startedAt: null,
      message: 'Cloudflare tunnel stopped'
    })
    return this.getStatus()
  }

  private setStatus(next: TunnelStatus): void {
    this.status = next
    this.persistState(next)
    this.events.emit('status', this.getStatus())
  }

  private persistState(status: TunnelStatus): void {
    const persisted: PersistedTunnelState = {
      endpoint: status.endpoint,
      mode: status.mode,
      updatedAt: Date.now()
    }

    const stateFile = getStateFilePath()
    mkdirSync(dirname(stateFile), { recursive: true })
    writeFileSync(stateFile, JSON.stringify(persisted), 'utf8')
  }

  private loadPersistedState(): void {
    try {
      const raw = readFileSync(getStateFilePath(), 'utf8')
      const parsed = JSON.parse(raw) as PersistedTunnelState
      this.status = {
        ...this.status,
        endpoint: parsed.endpoint,
        mode: parsed.mode,
        message: null
      }
    } catch {
      // Fresh install or empty state.
    }
  }
}

let manager: CloudflareTunnelManager | null = null

export function getCloudflareTunnelManager(): CloudflareTunnelManager {
  if (!manager) {
    manager = new CloudflareTunnelManager()
  }
  return manager
}
