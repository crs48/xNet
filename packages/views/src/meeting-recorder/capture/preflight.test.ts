/**
 * Permissions pre-flight tests (exploration 0279): the pure prompt/blocker
 * mapping per system-audio path, and the bridge fetch (fake preload bridge,
 * including the new `permissions()` method).
 */

import { describe, expect, it, vi } from 'vitest'
import { describeCapturePreflight, getCapturePreflight } from './preflight'
import { fakeMeetingsBridge } from './test-bridge'

describe('describeCapturePreflight', () => {
  it('announces the first-run System Audio prompt on the Core Audio tap path', () => {
    const result = describeCapturePreflight(
      { microphone: 'granted', systemAudio: 'audio-capture-tcc' },
      { systemAudioPath: 'core-audio-tap' }
    )
    expect(result.blocker).toBeNull()
    expect(result.prompts).toHaveLength(1)
    expect(result.prompts[0]).toMatch(/System Audio Recording/)
  })

  it('announces mic + screen-recording prompts on the loopback path when undetermined', () => {
    const result = describeCapturePreflight(
      { microphone: 'not-determined', systemAudio: 'not-determined' },
      { systemAudioPath: 'chromium-loopback' }
    )
    expect(result.blocker).toBeNull()
    expect(result.prompts).toHaveLength(2)
    expect(result.prompts[0]).toMatch(/Microphone/)
    expect(result.prompts[1]).toMatch(/Screen Recording/)
    // Restart-after-grant is part of the expectation-setting, not just denial.
    expect(result.prompts[1]).toMatch(/restart/)
  })

  it('explains System Settings + restart-after-grant when screen recording was denied', () => {
    const result = describeCapturePreflight(
      { microphone: 'granted', systemAudio: 'denied' },
      { systemAudioPath: 'chromium-loopback' }
    )
    expect(result.prompts).toHaveLength(0)
    expect(result.blocker).toMatch(/System Settings/)
    expect(result.blocker).toMatch(/restarts/)
    expect(result.blocker).toMatch(/mic-only/)
  })

  it('flags a denied microphone as a blocker', () => {
    const result = describeCapturePreflight(
      { microphone: 'denied', systemAudio: 'granted' },
      { systemAudioPath: 'chromium-loopback' }
    )
    expect(result.blocker).toMatch(/Microphone/)
    expect(result.blocker).toMatch(/System Settings/)
  })

  it('ignores screen-recording state off the loopback path', () => {
    const result = describeCapturePreflight(
      { microphone: 'granted', systemAudio: 'denied' },
      { systemAudioPath: 'none' }
    )
    expect(result.prompts).toHaveLength(0)
    expect(result.blocker).toBeNull()
  })

  it('is quiet when everything is already granted', () => {
    const result = describeCapturePreflight(
      { microphone: 'granted', systemAudio: 'granted' },
      { systemAudioPath: 'chromium-loopback' }
    )
    expect(result).toEqual({ prompts: [], blocker: null })
  })
})

describe('getCapturePreflight', () => {
  it('joins permissions() + captureStatus() from the bridge', async () => {
    const bridge = fakeMeetingsBridge({
      permissions: vi.fn(async () => ({
        microphone: 'not-determined' as const,
        systemAudio: 'audio-capture-tcc' as const
      }))
    })
    const result = await getCapturePreflight(bridge)
    expect(bridge.permissions).toHaveBeenCalledOnce()
    expect(bridge.captureStatus).toHaveBeenCalledOnce()
    expect(result?.prompts).toHaveLength(2) // mic prompt + system-audio prompt
  })

  it('returns null with no bridge (web) or a bridge without permissions()', async () => {
    await expect(getCapturePreflight(null)).resolves.toBeNull()
    const legacy = fakeMeetingsBridge()
    // An older preload without the method — the recorder must not crash.
    delete (legacy as { permissions?: unknown }).permissions
    await expect(getCapturePreflight(legacy)).resolves.toBeNull()
  })

  it('returns null when the bridge throws', async () => {
    const bridge = fakeMeetingsBridge({
      permissions: vi.fn(async () => {
        throw new Error('ipc down')
      })
    })
    await expect(getCapturePreflight(bridge)).resolves.toBeNull()
  })
})
