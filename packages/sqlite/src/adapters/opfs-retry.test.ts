import { describe, expect, it, vi } from 'vitest'
import { isOpfsLockError, withOpfsLockRetry } from './opfs-retry'

const noSleep = () => Promise.resolve()

function lockError(): Error {
  const err = new Error(
    "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file."
  )
  err.name = 'NoModificationAllowedError'
  return err
}

describe('isOpfsLockError', () => {
  it('detects the SAH contention error by name', () => {
    expect(isOpfsLockError(lockError())).toBe(true)
  })

  it('detects it by message even without the name', () => {
    expect(isOpfsLockError(new Error('createSyncAccessHandle failed'))).toBe(true)
    expect(isOpfsLockError(new Error('Access Handles cannot be created ...'))).toBe(true)
  })

  it('does not match unrelated open failures (unsupported / quota)', () => {
    expect(isOpfsLockError(new Error('OPFS is not available'))).toBe(false)
    expect(isOpfsLockError(new DOMException('quota', 'QuotaExceededError'))).toBe(false)
    expect(isOpfsLockError(null)).toBe(false)
    expect(isOpfsLockError(undefined)).toBe(false)
  })
})

describe('withOpfsLockRetry', () => {
  it('returns immediately on success without retrying', async () => {
    const fn = vi.fn(async () => 'ok')
    const onRetry = vi.fn()
    await expect(withOpfsLockRetry(fn, { sleep: noSleep, onRetry })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('retries the lock error and succeeds once handles are released', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw lockError()
      return 'opfs'
    })
    const onRetry = vi.fn()
    await expect(withOpfsLockRetry(fn, { sleep: noSleep, onRetry })).resolves.toBe('opfs')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('rethrows the lock error after exhausting attempts', async () => {
    const fn = vi.fn(async () => {
      throw lockError()
    })
    await expect(withOpfsLockRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toMatchObject({
      name: 'NoModificationAllowedError'
    })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry a non-lock error — falls through immediately', async () => {
    const fn = vi.fn(async () => {
      throw new Error('OPFS is not available')
    })
    await expect(withOpfsLockRetry(fn, { sleep: noSleep })).rejects.toThrow('OPFS is not available')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('applies linear backoff delays between retries', async () => {
    const delays: number[] = []
    const sleep = (ms: number) => {
      delays.push(ms)
      return Promise.resolve()
    }
    let calls = 0
    const fn = async () => {
      calls += 1
      if (calls < 4) throw lockError()
      return 'opfs'
    }
    await withOpfsLockRetry(fn, { baseDelayMs: 100, sleep })
    expect(delays).toEqual([100, 200, 300])
  })
})
