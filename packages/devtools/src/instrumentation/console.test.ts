import { describe, it, expect, vi, afterEach } from 'vitest'
import { ConsoleLogStore } from '../core/log-store'
import { instrumentConsole } from './console'

function makeStore() {
  return new ConsoleLogStore({ sessionStore: null, flagStore: null })
}

describe('instrumentConsole', () => {
  const restores: Array<() => void> = []
  afterEach(() => {
    // Unwind the taps first (they captured the spies as "originals"), then
    // drop the spies so console.* ends up as the real methods again.
    while (restores.length) restores.pop()!()
    vi.restoreAllMocks()
  })

  function tap(store: ConsoleLogStore): () => void {
    const restore = instrumentConsole(store)
    restores.push(restore)
    return restore
  }

  it('records all five levels and still calls the originals', () => {
    const store = makeStore()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tap(store)

    console.debug('d')
    console.log('l')
    console.info('i')
    console.warn('w')
    console.error('e')

    expect(store.getEntries().map((e) => e.level)).toEqual([
      'debug',
      'log',
      'info',
      'warn',
      'error'
    ])
    expect(spy).toHaveBeenCalledWith('w')
  })

  it('stringifies non-string args and classifies channels', () => {
    const store = makeStore()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    tap(store)

    console.log('[WebSQLiteAdapter]', { pool: 3 })
    const [e] = store.getEntries()
    expect(e.message).toBe('[WebSQLiteAdapter] {"pool":3}')
    expect(e.channel).toBe('sqlite')
  })

  it('keeps capturing while no panel is subscribed (the 0275 bug)', () => {
    const store = makeStore()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    tap(store)

    const unsubscribe = store.subscribe(() => {})
    console.log('panel open')
    unsubscribe() // Logs tab unmounts
    console.log('panel closed')

    expect(store.getEntries().map((e) => e.message)).toEqual(['panel open', 'panel closed'])
  })

  it('does not re-enter when a store listener logs (recursion guard)', () => {
    const store = makeStore()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    tap(store)

    store.subscribe(() => {
      // a listener that logs must not trigger a second capture
      console.error('listener noise')
    })
    console.error('real error')

    expect(store.getEntries().map((e) => e.message)).toEqual(['real error'])
  })

  it('respects capturing/paused flags', () => {
    const store = makeStore()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    tap(store)

    store.paused = true
    console.log('while paused')
    store.paused = false
    store.capturing = false
    console.log('while off')
    store.capturing = true
    console.log('recorded')

    expect(store.getEntries().map((e) => e.message)).toEqual(['recorded'])
  })

  it('restore puts the original console methods back', () => {
    const store = makeStore()
    const originalLog = console.log
    const restore = tap(store)
    expect(console.log).not.toBe(originalLog)
    restore()
    expect(console.log).toBe(originalLog)

    console.log = vi.fn() // avoid noise; verify no capture happens post-restore
    console.log('after restore')
    console.log = originalLog
    expect(store.size).toBe(0)
  })
})
