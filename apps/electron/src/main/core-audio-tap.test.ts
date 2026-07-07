/**
 * The 0279 system-audio fallback ladder: Core Audio tap (macOS 14.4+, helper
 * present) → Chromium loopback (darwin/win32) → none (renderer goes mic-only).
 * Pure resolution logic only — spawning the Swift helper needs a mac.
 */

import { describe, expect, it } from 'vitest'
import { resolveSystemAudioPath, tapAvailable } from './core-audio-tap'

describe('resolveSystemAudioPath', () => {
  it('windows always gets chromium loopback (WASAPI, first-class)', () => {
    expect(resolveSystemAudioPath('win32', '10.0.19045')).toBe('chromium-loopback')
  })

  it('macOS without the helper binary falls back to loopback flags', () => {
    // darwin 23.4 = macOS 14.4, but no helper is built in this checkout.
    expect(resolveSystemAudioPath('darwin', '23.4.0')).toBe('chromium-loopback')
  })

  it('linux has no system-audio path (mic-only tier)', () => {
    expect(resolveSystemAudioPath('linux', '6.8.0')).toBe('none')
  })
})

describe('tapAvailable', () => {
  it('requires darwin ≥ 23.4 (macOS 14.4) before even probing the binary', () => {
    expect(tapAvailable('darwin', '22.6.0')).toBe(false) // macOS 13
    expect(tapAvailable('darwin', '23.3.0')).toBe(false) // macOS 14.3
    expect(tapAvailable('win32', '10.0.19045')).toBe(false)
    // 23.4+ continues to the existsSync probe (false here — helper not built).
    expect(tapAvailable('darwin', '23.4.0')).toBe(false)
  })
})
