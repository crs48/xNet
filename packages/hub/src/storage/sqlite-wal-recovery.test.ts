import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import {
  isCorruptionError,
  isShmSizeError,
  openHubDatabaseWithWalRecovery,
  walSidecarPaths,
  type WalRecoveryHooks
} from './sqlite'

function shmError(): Error {
  const e = new Error('disk I/O error') as Error & { code?: string }
  e.code = 'SQLITE_IOERR_SHMSIZE'
  return e
}

function corruptError(): Error {
  const e = new Error('database disk image is malformed') as Error & { code?: string }
  e.code = 'SQLITE_CORRUPT'
  return e
}

function fakeDb(): Database.Database {
  return { close: vi.fn() } as unknown as Database.Database
}

function makeHooks(overrides: Partial<WalRecoveryHooks> = {}): WalRecoveryHooks {
  return {
    openDb: vi.fn(() => fakeDb()),
    applyWalPragmas: vi.fn(),
    applyRollbackPragmas: vi.fn(),
    removeSidecars: vi.fn(),
    resetDatabase: vi.fn(),
    allowDestructiveReset: false,
    underLitestream: false,
    onRecover: vi.fn(),
    ...overrides
  }
}

describe('isShmSizeError', () => {
  it('matches the SHMSIZE code and message', () => {
    expect(isShmSizeError(shmError())).toBe(true)
    expect(isShmSizeError(new Error('SqliteError: SQLITE_IOERR_SHMSIZE'))).toBe(true)
  })

  it('rejects unrelated errors and nullish', () => {
    expect(isShmSizeError(new Error('boom'))).toBe(false)
    expect(isShmSizeError(null)).toBe(false)
    expect(isShmSizeError(undefined)).toBe(false)
  })
})

describe('isCorruptionError', () => {
  it('matches SQLITE_CORRUPT / SQLITE_NOTADB by code and message', () => {
    expect(isCorruptionError(corruptError())).toBe(true)
    expect(isCorruptionError(new Error('database disk image is malformed'))).toBe(true)
    const notADb = new Error('file is not a database') as Error & { code?: string }
    notADb.code = 'SQLITE_NOTADB'
    expect(isCorruptionError(notADb)).toBe(true)
  })

  it('rejects unrelated errors (e.g. SHMSIZE) and nullish', () => {
    expect(isCorruptionError(shmError())).toBe(false)
    expect(isCorruptionError(new Error('boom'))).toBe(false)
    expect(isCorruptionError(null)).toBe(false)
  })
})

describe('walSidecarPaths', () => {
  it('returns the -wal and -shm files next to the db', () => {
    expect(walSidecarPaths('/data/hub.db')).toEqual(['/data/hub.db-wal', '/data/hub.db-shm'])
  })
})

describe('openHubDatabaseWithWalRecovery', () => {
  it('opens normally and never touches sidecars on the happy path', () => {
    const hooks = makeHooks()
    const db = openHubDatabaseWithWalRecovery(hooks)
    expect(db).toBeDefined()
    expect(hooks.removeSidecars).not.toHaveBeenCalled()
    expect(hooks.applyRollbackPragmas).not.toHaveBeenCalled()
    expect(hooks.onRecover).not.toHaveBeenCalled()
  })

  it('clears -wal/-shm and retries on SHMSIZE, then succeeds with WAL', () => {
    const applyWalPragmas = vi.fn().mockImplementationOnce(() => {
      throw shmError()
    })
    const hooks = makeHooks({ applyWalPragmas })
    const db = openHubDatabaseWithWalRecovery(hooks)
    expect(db).toBeDefined()
    expect(applyWalPragmas).toHaveBeenCalledTimes(2)
    expect(hooks.removeSidecars).toHaveBeenCalledTimes(1)
    expect(hooks.applyRollbackPragmas).not.toHaveBeenCalled()
    expect(hooks.onRecover).toHaveBeenCalledWith('clear-wal', expect.anything())
  })

  it('falls back to a rollback journal when WAL still fails after clearing', () => {
    const applyWalPragmas = vi.fn(() => {
      throw shmError()
    })
    const hooks = makeHooks({ applyWalPragmas })
    openHubDatabaseWithWalRecovery(hooks)
    expect(hooks.removeSidecars).toHaveBeenCalledTimes(1)
    expect(hooks.applyRollbackPragmas).toHaveBeenCalledTimes(1)
    expect(hooks.onRecover).toHaveBeenCalledWith('rollback-journal', expect.anything())
  })

  it('rethrows non-recoverable errors without touching the database', () => {
    const applyWalPragmas = vi.fn(() => {
      throw new Error('something else')
    })
    const hooks = makeHooks({ applyWalPragmas })
    expect(() => openHubDatabaseWithWalRecovery(hooks)).toThrow('something else')
    expect(hooks.removeSidecars).not.toHaveBeenCalled()
    expect(hooks.resetDatabase).not.toHaveBeenCalled()
  })

  it('rethrows SHMSIZE under Litestream — never silently drops the replicated WAL', () => {
    const applyWalPragmas = vi.fn(() => {
      throw shmError()
    })
    const hooks = makeHooks({ applyWalPragmas, underLitestream: true })
    expect(() => openHubDatabaseWithWalRecovery(hooks)).toThrow()
    expect(hooks.removeSidecars).not.toHaveBeenCalled()
  })

  describe('corrupt base database', () => {
    it('resets and reopens fresh when the demo hub allows it', () => {
      const applyWalPragmas = vi.fn().mockImplementationOnce(() => {
        throw corruptError()
      })
      const hooks = makeHooks({ applyWalPragmas, allowDestructiveReset: true })
      const db = openHubDatabaseWithWalRecovery(hooks)
      expect(db).toBeDefined()
      expect(hooks.resetDatabase).toHaveBeenCalledTimes(1)
      expect(applyWalPragmas).toHaveBeenCalledTimes(2)
      expect(hooks.onRecover).toHaveBeenCalledWith('reset-corrupt', expect.anything())
    })

    it('also recovers when corruption surfaces after clearing a wedged WAL', () => {
      const applyWalPragmas = vi
        .fn()
        .mockImplementationOnce(() => {
          throw shmError()
        }) // first: wedged WAL → clear sidecars
        .mockImplementationOnce(() => {
          throw corruptError()
        }) // retry: base DB corrupt → reset
      const hooks = makeHooks({ applyWalPragmas, allowDestructiveReset: true })
      openHubDatabaseWithWalRecovery(hooks)
      expect(hooks.removeSidecars).toHaveBeenCalledTimes(1)
      expect(hooks.resetDatabase).toHaveBeenCalledTimes(1)
      expect(hooks.onRecover).toHaveBeenCalledWith('reset-corrupt', expect.anything())
    })

    it('does NOT reset a corrupt DB when destructive reset is disabled (production hub)', () => {
      const applyWalPragmas = vi.fn(() => {
        throw corruptError()
      })
      const hooks = makeHooks({ applyWalPragmas, allowDestructiveReset: false })
      expect(() => openHubDatabaseWithWalRecovery(hooks)).toThrow('malformed')
      expect(hooks.resetDatabase).not.toHaveBeenCalled()
    })

    it('does NOT reset under Litestream even in demo mode (the replica is authoritative)', () => {
      const applyWalPragmas = vi.fn(() => {
        throw corruptError()
      })
      const hooks = makeHooks({
        applyWalPragmas,
        allowDestructiveReset: true,
        underLitestream: true
      })
      expect(() => openHubDatabaseWithWalRecovery(hooks)).toThrow()
      expect(hooks.resetDatabase).not.toHaveBeenCalled()
    })
  })
})
