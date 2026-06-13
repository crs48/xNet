/**
 * @xnetjs/cloud-litestream — supervised controller.
 *
 * Runs `litestream replicate` as a child of the hub process so the hub controls the
 * shutdown ordering required for a near-zero RPO (exploration 0178): on stop,
 * quiesce writes → **drain Litestream** (SIGTERM the child, await its flush+exit) →
 * `db.close()`. The spawner is injectable, so start/drain are testable with no binary.
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { replicateArgs } from './commands'

export interface SpawnedProcess {
  readonly pid?: number
  kill(signal?: NodeJS.Signals | number): boolean
  once(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): unknown
}

export type Spawner = (command: string, args: string[]) => SpawnedProcess

export interface LitestreamControllerOptions {
  /** Litestream binary; default `litestream`. */
  binary?: string
  /** Config path passed to `replicate -config`. */
  configPath?: string
  /** Injectable spawner; defaults to `node:child_process.spawn` (inherited stdio). */
  spawn?: Spawner
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

export type DrainResult = 'drained' | 'timeout' | 'not-running'

const defaultSpawn: Spawner = (command, args) =>
  nodeSpawn(command, args, { stdio: 'inherit' }) as unknown as SpawnedProcess

export class LitestreamController {
  private proc: SpawnedProcess | null = null
  private exited = false
  private readonly binary: string
  private readonly configPath?: string
  private readonly spawn: Spawner
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>

  constructor(options: LitestreamControllerOptions = {}) {
    this.binary = options.binary ?? 'litestream'
    this.configPath = options.configPath
    this.spawn = options.spawn ?? defaultSpawn
    this.logger = options.logger ?? console
  }

  /** Spawn `litestream replicate`. Idempotent (no-op if already running). */
  start(): void {
    if (this.proc) return
    const args = replicateArgs(this.configPath ? { configPath: this.configPath } : {})
    this.proc = this.spawn(this.binary, args)
    this.exited = false
    this.proc.once('exit', (code) => {
      this.exited = true
      this.logger.info(`[litestream] replicate exited (code ${code})`)
    })
  }

  get running(): boolean {
    return this.proc !== null && !this.exited
  }

  /**
   * Stop replication and wait for Litestream to flush its final WAL frames and exit.
   * Resolves `drained` on clean exit, `timeout` if it doesn't exit within `graceMs`,
   * `not-running` if it was never started.
   */
  async drain(graceMs: number): Promise<DrainResult> {
    if (!this.proc) return 'not-running'
    if (this.exited) return 'drained'
    const proc = this.proc
    return new Promise<DrainResult>((resolve) => {
      const timer = setTimeout(() => {
        this.logger.warn('[litestream] drain timed out; final WAL frames may be unsynced')
        resolve('timeout')
      }, graceMs)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve('drained')
      })
      proc.kill('SIGTERM')
    })
  }
}
