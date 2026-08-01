/**
 * The capability register (0422). The CI gate proves *structure* — every flag
 * declared, every entry surfaced. These tests hold the parts a source scan
 * cannot see: that the copy is honest and that Labs stays a view of the
 * register rather than a second list that can drift from it.
 */
import { AI_ASSIST_MODE_KEY, DESK_RADIAL_KEY, QUIET_DEFAULT_KEY } from '@xnetjs/workbench'
import { describe, expect, it } from 'vitest'
import { CAPABILITIES, LABS_CAPABILITIES } from './capabilities'
import { LABS_FLAGS } from './labs'

describe('capability register', () => {
  it('declares the shipped capabilities with real keys', () => {
    const keys = CAPABILITIES.map((capability) => capability.key)
    expect(keys).toContain(QUIET_DEFAULT_KEY)
    expect(keys).toContain(DESK_RADIAL_KEY)
    expect(keys).toContain(AI_ASSIST_MODE_KEY)
  })

  it('gives every entry a surface or a written reason it has none', () => {
    for (const capability of CAPABILITIES) {
      if (capability.surface === null) {
        // The `humane-ok` bargain: an exception is allowed, an unexplained one
        // is not. A blank reason is the silent omission this register exists
        // to prevent.
        expect(capability.hidden?.trim(), `${capability.key} hides with no reason`).toBeTruthy()
      } else {
        expect(capability.surface.length, `${capability.key} has an empty surface`).toBeGreaterThan(
          0
        )
      }
    }
  })

  it('writes honest copy — no placeholder labels or descriptions', () => {
    for (const capability of CAPABILITIES) {
      expect(capability.label.length).toBeGreaterThan(0)
      expect(capability.description.length).toBeGreaterThan(20)
    }
  })

  it('routes the assist mode to Settings, not to Labs', () => {
    // Labs is staging for things that may vanish. The assist mode is a
    // standing choice about how the assistant treats your work, so surfacing
    // it as an experiment would misdescribe it (Charter §Agency).
    const assist = CAPABILITIES.find((capability) => capability.key === AI_ASSIST_MODE_KEY)
    expect(assist?.stage).toBe('stable')
    expect(assist?.surface).toEqual([{ kind: 'settings', section: 'ai' }])
  })

  it('derives Labs from the register instead of keeping a second list', () => {
    expect(LABS_FLAGS).toBe(LABS_CAPABILITIES)
    for (const flag of LABS_FLAGS) {
      expect(flag.surface?.some((surface) => surface.kind === 'labs')).toBe(true)
    }
    // The assist mode is declared but not a Labs row — proof the register is
    // wider than the surface, which is the whole point of splitting them.
    expect(LABS_FLAGS.map((flag) => flag.key)).not.toContain(AI_ASSIST_MODE_KEY)
  })
})
