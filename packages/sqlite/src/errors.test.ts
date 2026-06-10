import { describe, expect, it } from 'vitest'
import { isSQLiteCorruptionError } from './errors'

describe('isSQLiteCorruptionError', () => {
  it('matches SQLite result codes for corrupt and non-database files', () => {
    expect(isSQLiteCorruptionError({ resultCode: 11, message: 'SQLITE_CORRUPT' })).toBe(true)
    expect(isSQLiteCorruptionError({ resultCode: 26, message: 'SQLITE_NOTADB' })).toBe(true)
  })

  it('matches native and wasm corruption messages', () => {
    expect(
      isSQLiteCorruptionError(
        new Error('SQLITE_CORRUPT: sqlite3 result code 11: database disk image is malformed')
      )
    ).toBe(true)
    expect(isSQLiteCorruptionError(new Error('file is not a database'))).toBe(true)
  })

  it('matches nested causes without looping forever', () => {
    const error = new Error('wrapped')
    const cause = new Error('database disk image is malformed')
    Object.defineProperty(error, 'cause', { value: cause })

    expect(isSQLiteCorruptionError(error)).toBe(true)

    Object.defineProperty(cause, 'cause', { value: error })
    expect(isSQLiteCorruptionError(error)).toBe(true)
  })

  it('does not match unrelated SQLite errors', () => {
    expect(isSQLiteCorruptionError(new Error('SQLITE_BUSY: database is locked'))).toBe(false)
    expect(isSQLiteCorruptionError({ resultCode: 1, message: 'SQLITE_ERROR' })).toBe(false)
    expect(isSQLiteCorruptionError(null)).toBe(false)
  })
})
