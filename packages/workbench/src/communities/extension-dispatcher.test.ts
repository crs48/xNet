// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtensionDispatcher } from './extension-dispatcher'
import { ExtensionAccessError } from './extension-protocol'

const command = (id = 'one') => ({ version: 1, id, operation: 'data.undo', receipt: 'receipt' })
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())
describe('host-bound extension dispatcher', () => {
  it('stops pending requests, drops late responses, and refuses admission after stop', async () => {
    let finish!: (value: unknown) => void
    let signal!: AbortSignal
    const send = vi.fn()
    const dispatch = createExtensionDispatcher(async (_, current) => {
      signal = current
      return new Promise((resolve) => {
        finish = resolve
      })
    }, send)
    dispatch.dispatch(command())
    await flush()
    dispatch.stop()
    expect(signal.aborted).toBe(true)
    finish({ secret: 'late result' })
    await flush()
    expect(send).not.toHaveBeenCalled()
    expect(() => dispatch.dispatch(command('two'))).toThrow('stopped')
  })
  it('cancels before invoking the host, bounds outstanding calls and rejects caller forgery', async () => {
    const host = vi.fn(async () => new Promise(() => {})),
      send = vi.fn()
    const dispatcher = createExtensionDispatcher(host, send)
    expect(() => dispatcher.dispatch({ ...command(), owner: 'another' })).toThrow('Unsupported')
    for (let i = 0; i < 20; i++) dispatcher.dispatch(command(String(i)))
    dispatcher.dispatch(command('over-limit'))
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'quota' }) })
    )
    expect(() => dispatcher.dispatch(command('0'))).toThrow('Duplicate')
    dispatcher.stop()
    await flush()
    expect(host).not.toHaveBeenCalled()
  })
  it('returns one timeout, cancels work, and rejects late success without leaking internal errors', async () => {
    vi.useFakeTimers()
    let finish!: (value: unknown) => void
    let signal!: AbortSignal
    const send = vi.fn()
    const dispatcher = createExtensionDispatcher(async (_, current) => {
      signal = current
      return new Promise((resolve) => {
        finish = resolve
      })
    }, send)
    dispatcher.dispatch(command())
    await flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(signal.aborted).toBe(true)
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 'one',
        error: expect.objectContaining({ _tag: 'ExtensionAccessError', code: 'timeout' })
      })
    )
    finish('late')
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    dispatcher.stop()
    const rejected = createExtensionDispatcher(async () => {
      throw new ExtensionAccessError('denied', 'No task grant.')
    }, send)
    rejected.dispatch(command('denied'))
    await flush()
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'denied', message: 'No task grant.' })
      })
    )
    rejected.stop()
  })
})
