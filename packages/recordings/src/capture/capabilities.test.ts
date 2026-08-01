import { describe, expect, it } from 'vitest'
import { detectVideoCapability, isBetterPath } from './capabilities'

describe('detectVideoCapability', () => {
  it('prefers the native helper when Electron reports it', () => {
    const capability = detectVideoCapability({
      isElectron: true,
      electronScreenHelper: true,
      camera: true
    })

    expect(capability.path).toBe('screencapturekit-helper')
    expect(capability.cameraTrack).toBe(true)
    expect(capability.systemIndicator).toBe(true)
  })

  it('falls back to the Chromium path in Electron without the helper, and says so', () => {
    const capability = detectVideoCapability({ isElectron: true, electronScreenHelper: false })

    expect(capability.path).toBe('chromium-desktop-capturer')
    expect(capability.systemIndicator).toBe(false)
    expect(capability.scopeMessage).toMatch(/more CPU/)
  })

  it('offers screen-only capture on the web and names the missing camera track', () => {
    const capability = detectVideoCapability({ displayMedia: true, camera: true })

    expect(capability.path).toBe('display-media')
    expect(capability.cameraTrack).toBe(false)
    expect(capability.scopeMessage).toMatch(/No camera track/)
  })

  it('reports no path on mobile rather than pretending', () => {
    expect(detectVideoCapability({ isMobile: true }).path).toBe('none')
  })

  it('reports no path in a browser without getDisplayMedia', () => {
    const capability = detectVideoCapability({})

    expect(capability.path).toBe('none')
    expect(capability.scopeMessage).toMatch(/cannot record/)
  })

  it('always states a scope before recording can start', () => {
    const hints = [
      { isElectron: true, electronScreenHelper: true },
      { isElectron: true },
      { displayMedia: true },
      { isMobile: true },
      {}
    ]

    for (const hint of hints) {
      expect(detectVideoCapability(hint).scopeMessage.length).toBeGreaterThan(20)
    }
  })
})

describe('isBetterPath', () => {
  it('ranks the helper above the Chromium path above the browser', () => {
    expect(isBetterPath('screencapturekit-helper', 'chromium-desktop-capturer')).toBe(true)
    expect(isBetterPath('chromium-desktop-capturer', 'display-media')).toBe(true)
    expect(isBetterPath('display-media', 'screencapturekit-helper')).toBe(false)
  })
})
