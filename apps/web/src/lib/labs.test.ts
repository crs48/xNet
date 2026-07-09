/**
 * Labs registry (0282): entries resolve the real flag keys, and toggling
 * round-trips localStorage exactly the way the feature readers check it.
 */
import { describe, expect, it } from 'vitest'
import { DESK_RADIAL_KEY, isDeskRadialEnabled, QUIET_DEFAULT_KEY } from './desk'
import { isLabEnabled, LABS_FLAGS, setLabEnabled } from './labs'

describe('labs registry', () => {
  it('covers the shipped experiment flags with real keys', () => {
    const keys = LABS_FLAGS.map((flag) => flag.key)
    expect(keys).toContain(QUIET_DEFAULT_KEY)
    expect(keys).toContain(DESK_RADIAL_KEY)
    // Every entry has honest copy — no empty descriptions.
    for (const flag of LABS_FLAGS) {
      expect(flag.label.length).toBeGreaterThan(0)
      expect(flag.description.length).toBeGreaterThan(20)
    }
  })

  it('round-trips through the same storage the feature readers check', () => {
    setLabEnabled(DESK_RADIAL_KEY, true)
    expect(isLabEnabled(DESK_RADIAL_KEY)).toBe(true)
    expect(isDeskRadialEnabled()).toBe(true)

    setLabEnabled(DESK_RADIAL_KEY, false)
    expect(isDeskRadialEnabled()).toBe(false)
    expect(localStorage.getItem(DESK_RADIAL_KEY)).toBeNull()
  })
})
