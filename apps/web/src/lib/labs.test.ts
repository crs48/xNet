/**
 * Labs registry (0282): entries resolve the real flag keys, and toggling
 * round-trips localStorage exactly the way the feature readers check it.
 */
import { describe, expect, it } from 'vitest'
import { isLayoutTreeEnabled, LAYOUT_TREE_KEY } from '../workbench/experiments'
import { DESK_RADIAL_KEY, isDeskRadialEnabled, QUIET_DEFAULT_KEY } from './desk'
import { isLabEnabled, LABS_FLAGS, setLabEnabled } from './labs'

describe('labs registry', () => {
  it('covers the three shipped experiment flags with real keys', () => {
    const keys = LABS_FLAGS.map((flag) => flag.key)
    expect(keys).toContain(LAYOUT_TREE_KEY)
    expect(keys).toContain(QUIET_DEFAULT_KEY)
    expect(keys).toContain(DESK_RADIAL_KEY)
    // Every entry has honest copy — no empty descriptions.
    for (const flag of LABS_FLAGS) {
      expect(flag.label.length).toBeGreaterThan(0)
      expect(flag.description.length).toBeGreaterThan(20)
    }
  })

  it('round-trips through the same storage the feature readers check', () => {
    setLabEnabled(LAYOUT_TREE_KEY, true)
    expect(isLabEnabled(LAYOUT_TREE_KEY)).toBe(true)
    expect(isLayoutTreeEnabled()).toBe(true)

    setLabEnabled(DESK_RADIAL_KEY, true)
    expect(isDeskRadialEnabled()).toBe(true)

    setLabEnabled(LAYOUT_TREE_KEY, false)
    expect(isLayoutTreeEnabled()).toBe(false)
    expect(localStorage.getItem(LAYOUT_TREE_KEY)).toBeNull()
    setLabEnabled(DESK_RADIAL_KEY, false)
  })
})
