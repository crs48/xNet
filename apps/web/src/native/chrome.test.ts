import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetNativeChrome, flushLocalData, installNativeChrome, routeDeepLink } from './chrome'

type MutableGlobal = { Capacitor?: unknown }
const g = globalThis as unknown as MutableGlobal

afterEach(() => {
  delete g.Capacitor
  __resetNativeChrome()
  globalThis.location.hash = ''
})

describe('routeDeepLink', () => {
  it('maps an xnet:// custom-scheme link to a hash route', () => {
    expect(routeDeepLink('xnet://doc/abc123')).toBe('/doc/abc123')
    expect(globalThis.location.hash).toBe('#/doc/abc123')
  })

  it('handles nested paths on the custom scheme', () => {
    expect(routeDeepLink('xnet://db/grid-1/row/7')).toBe('/db/grid-1/row/7')
  })

  it('uses the pathname of an https universal link', () => {
    expect(routeDeepLink('https://app.xnet.fyi/canvas/xyz')).toBe('/canvas/xyz')
  })

  it('returns null for empty or rootless links', () => {
    expect(routeDeepLink(undefined)).toBeNull()
    expect(routeDeepLink('')).toBeNull()
    expect(routeDeepLink('not a url')).toBeNull()
    expect(routeDeepLink('https://app.xnet.fyi/')).toBeNull()
  })
})

describe('flushLocalData', () => {
  it('dispatches the xnet:flush event', () => {
    const onFlush = vi.fn()
    document.addEventListener('xnet:flush', onFlush)
    flushLocalData()
    expect(onFlush).toHaveBeenCalledOnce()
    document.removeEventListener('xnet:flush', onFlush)
  })
})

describe('installNativeChrome', () => {
  it('is a no-op outside a native shell', () => {
    const dispose = installNativeChrome()
    expect(typeof dispose).toBe('function')
    // No listeners installed → visibilitychange does not flush.
    const onFlush = vi.fn()
    document.addEventListener('xnet:flush', onFlush)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onFlush).not.toHaveBeenCalled()
    document.removeEventListener('xnet:flush', onFlush)
    dispose()
  })

  it('wires deep links and background flush inside a native shell', () => {
    const listeners: Record<string, (data: unknown) => void> = {}
    const impact = vi.fn()
    g.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        App: {
          addListener: (event: string, cb: (data: unknown) => void) => {
            listeners[event] = cb
            return { remove: () => delete listeners[event] }
          }
        },
        Haptics: { impact }
      }
    }

    const dispose = installNativeChrome()

    // Deep link routes through the native App plugin.
    listeners.appUrlOpen?.({ url: 'xnet://doc/from-native' })
    expect(globalThis.location.hash).toBe('#/doc/from-native')

    // Backgrounding flushes the local DB.
    const onFlush = vi.fn()
    document.addEventListener('xnet:flush', onFlush)
    listeners.appStateChange?.({ isActive: false })
    expect(onFlush).toHaveBeenCalledOnce()

    // Commit fires a haptic.
    document.dispatchEvent(new Event('xnet:committed'))
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' })

    document.removeEventListener('xnet:flush', onFlush)
    dispose()
  })

  it('removes its listeners on dispose', () => {
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} }
    const dispose = installNativeChrome()
    dispose()

    const onFlush = vi.fn()
    document.addEventListener('xnet:flush', onFlush)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onFlush).not.toHaveBeenCalled()
    document.removeEventListener('xnet:flush', onFlush)
  })
})
