import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetMainCrashLog, installMainCrashLog, readMainCrashLog } from './crash-log'

let dir: string
let before: {
  uncaught: NodeJS.UncaughtExceptionListener[]
  rejection: NodeJS.UnhandledRejectionListener[]
}

/** The listeners installMainCrashLog registered (diff against the pre-test set). */
const installedListeners = () => ({
  uncaught: process
    .listeners('uncaughtException')
    .filter((l) => !before.uncaught.includes(l as NodeJS.UncaughtExceptionListener)),
  rejection: process
    .listeners('unhandledRejection')
    .filter((l) => !before.rejection.includes(l as NodeJS.UnhandledRejectionListener))
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xnet-crash-log-'))
  before = {
    uncaught: process.listeners('uncaughtException'),
    rejection: process.listeners('unhandledRejection')
  }
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  for (const l of installedListeners().uncaught) process.removeListener('uncaughtException', l)
  for (const l of installedListeners().rejection) process.removeListener('unhandledRejection', l)
  __resetMainCrashLog()
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('installMainCrashLog', () => {
  it('writes an uncaughtException as a JSON line in userData and to stderr', () => {
    installMainCrashLog(dir)
    const [listener] = installedListeners().uncaught
    listener!(new Error('main went boom'), 'uncaughtException')

    const entries = readMainCrashLog()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'uncaughtException', message: 'main went boom' })
    expect(entries[0]?.stack).toContain('main went boom')
    expect(process.stderr.write).toHaveBeenCalled()

    const raw = readFileSync(join(dir, 'main-crash.log'), 'utf8')
    expect(() => JSON.parse(raw.trim())).not.toThrow()
  })

  it('records unhandled rejections, including non-Error reasons', () => {
    installMainCrashLog(dir)
    const [listener] = installedListeners().rejection
    listener!('plain string reason', Promise.resolve())

    expect(readMainCrashLog()).toMatchObject([
      { kind: 'unhandledRejection', message: 'plain string reason' }
    ])
  })

  it('is idempotent — a second install registers no extra listeners', () => {
    installMainCrashLog(dir)
    installMainCrashLog(dir)
    expect(installedListeners().uncaught).toHaveLength(1)
  })
})

describe('readMainCrashLog', () => {
  it('returns [] when nothing was installed or written', () => {
    expect(readMainCrashLog()).toEqual([])
  })

  it('skips torn/corrupt lines and reads across the rotated generation', () => {
    installMainCrashLog(dir)
    const path = join(dir, 'main-crash.log')
    writeFileSync(
      `${path}.1`,
      `${JSON.stringify({ kind: 'uncaughtException', message: 'old', at: 1 })}\n`
    )
    appendFileSync(path, 'not json {{{\n')
    appendFileSync(
      path,
      `${JSON.stringify({ kind: 'unhandledRejection', message: 'new', at: 2 })}\n`
    )

    const entries = readMainCrashLog()
    expect(entries.map((e) => e.message)).toEqual(['old', 'new'])
  })
})
