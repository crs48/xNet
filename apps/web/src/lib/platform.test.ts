import { afterEach, describe, expect, it } from 'vitest'
import {
  capacitorBridge,
  isCapacitor,
  isCrossOriginIsolated,
  isNativeShell,
  isStandalonePwa,
  nativePlatform
} from './platform'

type MutableGlobal = {
  Capacitor?: unknown
  crossOriginIsolated?: unknown
}

const g = globalThis as unknown as MutableGlobal

afterEach(() => {
  delete g.Capacitor
  // jsdom defines crossOriginIsolated as false; restore that.
  ;(g as { crossOriginIsolated?: unknown }).crossOriginIsolated = false
})

describe('platform detection', () => {
  it('reports web when no Capacitor bridge is present', () => {
    expect(isCapacitor()).toBe(false)
    expect(isNativeShell()).toBe(false)
    expect(nativePlatform()).toBe('web')
    expect(capacitorBridge()).toBeUndefined()
  })

  it('detects a native iOS shell', () => {
    g.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {}
    }
    expect(isCapacitor()).toBe(true)
    expect(isNativeShell()).toBe(true)
    expect(nativePlatform()).toBe('ios')
  })

  it('detects a native Android shell', () => {
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }
    expect(nativePlatform()).toBe('android')
    expect(isNativeShell()).toBe(true)
  })

  it('treats the Capacitor web layer as not-native', () => {
    g.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' }
    expect(isCapacitor()).toBe(true)
    expect(isNativeShell()).toBe(false)
    expect(nativePlatform()).toBe('web')
  })

  it('is defensive when isNativePlatform throws', () => {
    g.Capacitor = {
      isNativePlatform: () => {
        throw new Error('boom')
      }
    }
    expect(isNativeShell()).toBe(false)
  })

  it('reads crossOriginIsolated from the global', () => {
    expect(isCrossOriginIsolated()).toBe(false)
    ;(g as { crossOriginIsolated?: unknown }).crossOriginIsolated = true
    expect(isCrossOriginIsolated()).toBe(true)
  })

  it('detects standalone PWA via matchMedia', () => {
    // jsdom matchMedia returns matches:false by default → not standalone.
    expect(isStandalonePwa()).toBe(false)
  })
})
