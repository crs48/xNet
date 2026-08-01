/**
 * The 0414 video fallback ladder: ScreenCaptureKit helper (macOS 12.3+, helper
 * present) → Chromium desktopCapturer → unknown. Pure resolution logic only —
 * spawning the Swift helper needs a mac with a Screen Recording grant.
 *
 * `XNET_SCREENCAP_PATH` is pinned to a nonexistent path throughout so the
 * result never depends on whether this checkout happens to have run
 * `swift build` (it does after a native-helper change, and does not in CI).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  darwinSupportsScreenCaptureKit,
  helperIsBundled,
  resolveVideoCapturePath,
  screencapAvailable,
  screencapHelperPath
} from './screen-capture'

const MISSING = '/nonexistent/xnet-screencap'
let previous: string | undefined

beforeAll(() => {
  previous = process.env.XNET_SCREENCAP_PATH
  process.env.XNET_SCREENCAP_PATH = MISSING
})

afterAll(() => {
  if (previous === undefined) delete process.env.XNET_SCREENCAP_PATH
  else process.env.XNET_SCREENCAP_PATH = previous
})

describe('darwinSupportsScreenCaptureKit', () => {
  it('requires darwin ≥ 21.4 (macOS 12.3)', () => {
    expect(darwinSupportsScreenCaptureKit('21.3.0')).toBe(false) // macOS 12.2
    expect(darwinSupportsScreenCaptureKit('21.4.0')).toBe(true) // macOS 12.3
    expect(darwinSupportsScreenCaptureKit('24.0.0')).toBe(true) // macOS 15
  })

  it('refuses an unparseable release rather than assuming support', () => {
    expect(darwinSupportsScreenCaptureKit('')).toBe(false)
    expect(darwinSupportsScreenCaptureKit('not-a-version')).toBe(false)
  })
})

describe('resolveVideoCapturePath', () => {
  it('falls back to the Chromium path on macOS without the helper', () => {
    expect(resolveVideoCapturePath('darwin', '24.0.0')).toBe('chromium-desktop-capturer')
  })

  it('gives Windows and Linux the Chromium path', () => {
    expect(resolveVideoCapturePath('win32', '10.0.19045')).toBe('chromium-desktop-capturer')
    expect(resolveVideoCapturePath('linux', '6.8.0')).toBe('chromium-desktop-capturer')
  })

  it('reports unknown on a platform with no capture path at all', () => {
    expect(resolveVideoCapturePath('android', '5.0.0')).toBe('unknown')
  })
})

describe('screencapAvailable', () => {
  it('requires darwin before probing for the binary', () => {
    expect(screencapAvailable('win32', '10.0.19045')).toBe(false)
    expect(screencapAvailable('linux', '6.8.0')).toBe(false)
  })

  it('requires macOS 12.3 before probing for the binary', () => {
    expect(screencapAvailable('darwin', '21.0.0')).toBe(false)
  })

  it('is false when the helper binary is absent', () => {
    expect(screencapAvailable('darwin', '24.0.0')).toBe(false)
  })
})

describe('helperIsBundled', () => {
  it('recognises the .app layout macOS 26 requires for a TCC entry', () => {
    expect(helperIsBundled('/x/Resources/xnet-screencap.app/Contents/MacOS/xnet-screencap')).toBe(
      true
    )
  })

  it('reports a bare executable as unbundled — it can never be granted', () => {
    expect(helperIsBundled('/x/Resources/xnet-screencap')).toBe(false)
  })
})

describe('screencapHelperPath', () => {
  it('honours the override so tests and dev builds can point elsewhere', () => {
    expect(screencapHelperPath()).toBe(MISSING)
  })
})
