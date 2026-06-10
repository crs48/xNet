/**
 * SQLite error classification helpers.
 */

const SQLITE_CORRUPT_RESULT_CODE = 11
const SQLITE_NOTADB_RESULT_CODE = 26

type SQLiteErrorLike = {
  message?: unknown
  resultCode?: unknown
  code?: unknown
  cause?: unknown
}

function toErrorLike(error: unknown): SQLiteErrorLike | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  return error as SQLiteErrorLike
}

/**
 * Return true when an error represents a malformed or unreadable SQLite file.
 */
export function isSQLiteCorruptionError(error: unknown): boolean {
  return isSQLiteCorruptionErrorInternal(error, new Set())
}

function isSQLiteCorruptionErrorInternal(error: unknown, seen: Set<unknown>): boolean {
  const current = toErrorLike(error)
  if (!current) {
    return false
  }

  if (seen.has(error)) {
    return false
  }
  seen.add(error)

  const message =
    typeof current.message === 'string' ? current.message.toLowerCase() : String(current.message)
  const code = typeof current.code === 'string' ? current.code.toUpperCase() : ''
  const resultCode = typeof current.resultCode === 'number' ? current.resultCode : null

  return (
    resultCode === SQLITE_CORRUPT_RESULT_CODE ||
    resultCode === SQLITE_NOTADB_RESULT_CODE ||
    code === 'SQLITE_CORRUPT' ||
    code === 'SQLITE_NOTADB' ||
    message.includes('sqlite_corrupt') ||
    message.includes('sqlite_notadb') ||
    message.includes('database disk image is malformed') ||
    message.includes('file is not a database') ||
    isSQLiteCorruptionErrorInternal(current.cause, seen)
  )
}
