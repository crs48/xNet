import type { RecordingCaptureStatus, RecordingPermissions } from './bridge'
import { describe, expect, it } from 'vitest'
import { evaluatePreflight, LOW_DISK_BYTES, scopeSentence } from './preflight'

const status = (overrides: Partial<RecordingCaptureStatus> = {}): RecordingCaptureStatus => ({
  path: 'screencapturekit-helper',
  platform: 'darwin',
  helperAvailable: true,
  helperBundled: true,
  recording: false,
  ...overrides
})

const permissions = (overrides: Partial<RecordingPermissions> = {}): RecordingPermissions => ({
  screen: 'granted',
  camera: 'granted',
  ...overrides
})

describe('evaluatePreflight', () => {
  it('allows recording on the happy path with no warnings', () => {
    const result = evaluatePreflight({
      status: status(),
      permissions: permissions(),
      displayMedia: true,
      wantsCamera: true
    })

    expect(result.canRecord).toBe(true)
    expect(result.cameraAvailable).toBe(true)
    expect(result.notices.filter((n) => n.severity !== 'info')).toEqual([])
  })

  it('blocks with a named remedy when Screen Recording is denied', () => {
    const result = evaluatePreflight({
      status: status(),
      permissions: permissions({ screen: 'denied' }),
      displayMedia: true,
      wantsCamera: false
    })

    expect(result.canRecord).toBe(false)
    const blocker = result.notices.find((n) => n.severity === 'blocker')
    expect(blocker?.remedy).toMatch(/System Settings/)
  })

  it('warns about the macOS 26 unbundled-helper trap rather than waiting on a prompt', () => {
    const result = evaluatePreflight({
      status: status({ helperBundled: false }),
      permissions: permissions({ screen: 'not-determined' }),
      displayMedia: true,
      wantsCamera: false
    })

    const notice = result.notices.find((n) => n.message.includes('privacy settings'))
    expect(notice?.severity).toBe('warning')
    expect(notice?.remedy).toMatch(/Reinstall/)
  })

  it('degrades to screen-only when the camera is denied, without blocking', () => {
    const result = evaluatePreflight({
      status: status(),
      permissions: permissions({ camera: 'denied' }),
      displayMedia: true,
      wantsCamera: true
    })

    expect(result.canRecord).toBe(true)
    expect(result.cameraAvailable).toBe(false)
    expect(result.notices.some((n) => n.message.includes('screen only'))).toBe(true)
  })

  it('does not mention the camera when the user did not ask for one', () => {
    const result = evaluatePreflight({
      status: status(),
      permissions: permissions({ camera: 'denied' }),
      displayMedia: true,
      wantsCamera: false
    })

    expect(result.notices.some((n) => n.message.includes('Camera'))).toBe(false)
  })

  it('warns that the Chromium rung costs more and shows no indicator', () => {
    const result = evaluatePreflight({
      status: status({ path: 'chromium-desktop-capturer', helperAvailable: false }),
      permissions: permissions(),
      displayMedia: true,
      wantsCamera: false
    })

    expect(result.canRecord).toBe(true)
    expect(result.notices.some((n) => n.message.includes('more CPU'))).toBe(true)
  })

  it('falls back to the browser path when there is no bridge', () => {
    const result = evaluatePreflight({
      status: null,
      permissions: null,
      displayMedia: true,
      wantsCamera: true
    })

    expect(result.path).toBe('display-media')
    expect(result.canRecord).toBe(true)
    expect(result.cameraAvailable).toBe(false)
  })

  it('blocks entirely with no bridge and no getDisplayMedia', () => {
    const result = evaluatePreflight({
      status: null,
      permissions: null,
      displayMedia: false,
      wantsCamera: false
    })

    expect(result.path).toBe('unknown')
    expect(result.canRecord).toBe(false)
  })

  it('refuses to start a second concurrent recording', () => {
    const result = evaluatePreflight({
      status: status({ recording: true }),
      permissions: permissions(),
      displayMedia: true,
      wantsCamera: false
    })

    expect(result.canRecord).toBe(false)
    expect(result.notices.some((n) => n.message.includes('already in progress'))).toBe(true)
  })

  it('warns about low disk before recording rather than truncating later', () => {
    const result = evaluatePreflight({
      status: status(),
      permissions: permissions(),
      displayMedia: true,
      wantsCamera: false,
      freeDiskBytes: LOW_DISK_BYTES - 1
    })

    expect(result.canRecord).toBe(true)
    expect(result.notices.some((n) => n.message.includes('disk space'))).toBe(true)
  })

  it('stays quiet about disk when there is plenty', () => {
    const result = evaluatePreflight({
      status: status(),
      permissions: permissions(),
      displayMedia: true,
      wantsCamera: false,
      freeDiskBytes: 50 * 1024 * 1024 * 1024
    })

    expect(result.notices.some((n) => n.message.includes('disk space'))).toBe(false)
  })

  it('always gives every blocker a remedy', () => {
    const inputs = [
      { status: null, permissions: null, displayMedia: false, wantsCamera: false },
      {
        status: status(),
        permissions: permissions({ screen: 'denied' as const }),
        displayMedia: true,
        wantsCamera: false
      },
      {
        status: status({ recording: true }),
        permissions: permissions(),
        displayMedia: true,
        wantsCamera: false
      }
    ]

    for (const input of inputs) {
      for (const notice of evaluatePreflight(input).notices) {
        if (notice.severity === 'blocker') expect(notice.remedy).toBeTruthy()
      }
    }
  })
})

describe('scopeSentence', () => {
  it('names both tracks when the camera is included', () => {
    const preflight = evaluatePreflight({
      status: status(),
      permissions: permissions(),
      displayMedia: true,
      wantsCamera: true
    })

    expect(scopeSentence(preflight)).toMatch(/screen and camera/)
  })

  it('never claims a system indicator on the Chromium rung', () => {
    const preflight = evaluatePreflight({
      status: status({ path: 'chromium-desktop-capturer' }),
      permissions: permissions(),
      displayMedia: true,
      wantsCamera: false
    })

    expect(scopeSentence(preflight)).toMatch(/No system recording indicator/)
  })

  it('states the device cannot record when there is no path', () => {
    const preflight = evaluatePreflight({
      status: null,
      permissions: null,
      displayMedia: false,
      wantsCamera: false
    })

    expect(scopeSentence(preflight)).toMatch(/not available/)
  })
})
