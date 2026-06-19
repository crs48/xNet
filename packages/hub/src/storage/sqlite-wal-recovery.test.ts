import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import {
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

function fakeDb(): Database.Database {
  return { close: vi.fn() } as unknown as Database.Database
}

function makeHooks(overrides: Partial<WalRecoveryHooks> = {}): WalRecoveryHooks {
  return {
    openDb: vi.fn(() => fakeDb()),
    applyWalPragmas: vi.fn(),
    applyRollbackPragmas: vi.fn(),
    removeSidecars: vi.fn(),
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
    expect(hooks.onRecover).toHaveBeenCalledWith('retry', expect.anything())
  })

  it('falls back to a rollback journal when WAL still fails after clearing', () => {
    const applyWalPragmas = vi.fn(() => {
      throw shmError()
    })
    const hooks = makeHooks({ applyWalPragmas })
    openHubDatabaseWithWalRecovery(hooks)
    expect(hooks.removeSidecars).toHaveBeenCalledTimes(1)
    expect(hooks.applyRollbackPragmas).toHaveBeenCalledTimes(1)
    expect(hooks.onRecover).toHaveBeenCalledWith('fallback', expect.anything())
  })

  it('rethrows non-SHMSIZE errors without recovering', () => {
    const applyWalPragmas = vi.fn(() => {
      throw new Error('something else')
    })
    const hooks = makeHooks({ applyWalPragmas })
    expect(() => openHubDatabaseWithWalRecovery(hooks)).toThrow('something else')
    expect(hooks.removeSidecars).not.toHaveBeenCalled()
  })

  it('rethrows under Litestream — never silently drops the replicated WAL', () => {
    const applyWalPragmas = vi.fn(() => {
      throw shmError()
    })
    const hooks = makeHooks({ applyWalPragmas, underLitestream: true })
    expect(() => openHubDatabaseWithWalRecovery(hooks)).toThrow()
    expect(hooks.removeSidecars).not.toHaveBeenCalled()
  })
})
