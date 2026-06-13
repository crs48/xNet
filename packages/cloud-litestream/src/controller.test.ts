import { describe, expect, it, vi } from 'vitest'
import { LitestreamController, type SpawnedProcess, type Spawner } from './controller'

/** A controllable fake child process — emit `exit` on demand; record kill signals. */
class FakeProc implements SpawnedProcess {
  readonly pid = 4242
  killed: Array<string | number | undefined> = []
  private exitCbs: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = []
  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed.push(signal)
    return true
  }
  once(_event: 'exit', cb: (code: number | null, signal: NodeJS.Signals | null) => void): unknown {
    this.exitCbs.push(cb)
    return this
  }
  emitExit(code: number | null = 0): void {
    for (const cb of this.exitCbs.splice(0)) cb(code, null)
  }
}

function harness() {
  const proc = new FakeProc()
  const spawn = vi.fn((_cmd: string, _args: string[]) => proc) as unknown as Spawner
  const controller = new LitestreamController({
    binary: 'litestream',
    configPath: '/etc/litestream.yml',
    spawn,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  })
  return { controller, proc, spawn: spawn as unknown as ReturnType<typeof vi.fn> }
}

describe('LitestreamController', () => {
  it('spawns `litestream replicate -config <path>` on start (idempotent)', () => {
    const { controller, spawn } = harness()
    controller.start()
    controller.start() // no-op second time
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith('litestream', [
      'replicate',
      '-config',
      '/etc/litestream.yml'
    ])
    expect(controller.running).toBe(true)
  })

  it('drains by SIGTERM and resolves once Litestream exits (RPO ≈ 0)', async () => {
    const { controller, proc } = harness()
    controller.start()
    const drain = controller.drain(1000)
    expect(proc.killed).toEqual(['SIGTERM']) // signalled to flush + exit
    proc.emitExit(0) // Litestream finished its final sync
    expect(await drain).toBe('drained')
    expect(controller.running).toBe(false)
  })

  it('returns timeout if Litestream does not exit within the grace period', async () => {
    const { controller } = harness()
    controller.start()
    expect(await controller.drain(5)).toBe('timeout') // never emits exit
  })

  it('reports not-running before start, and drained if it already exited', async () => {
    const { controller, proc } = harness()
    expect(await controller.drain(10)).toBe('not-running')
    controller.start()
    proc.emitExit(0) // exited on its own
    expect(controller.running).toBe(false)
    expect(await controller.drain(10)).toBe('drained')
  })
})
