import { describe, expect, it } from 'vitest'
import { describeSensitivityReason, filterReasons } from './filter-reasons'

describe('describeSensitivityReason', () => {
  it('explains an adult-content-disabled hide', () => {
    expect(
      describeSensitivityReason({ label: 'porn', effect: 'hide', cause: 'adult-disabled' })
    ).toBe('Explicit / pornographic: hidden because adult content is turned off')
  })

  it('explains a dial-driven warn', () => {
    expect(describeSensitivityReason({ label: 'sexual', effect: 'warn', cause: 'dial' })).toBe(
      'Sexually suggestive: flagged by your content & safety dial'
    )
  })

  it('explains the unsolicited-media rule (no label)', () => {
    expect(describeSensitivityReason({ effect: 'blur', cause: 'unsolicited-media' })).toMatch(
      /Media from someone you haven't connected with: blurred/
    )
  })

  it('returns null for a present-but-shown label', () => {
    expect(describeSensitivityReason({ label: 'nudity', effect: 'show', cause: 'dial' })).toBeNull()
  })
})

describe('filterReasons', () => {
  it('formats the filtering reasons and drops shown labels', () => {
    const reasons = filterReasons({
      visibility: 'hide',
      reasons: [
        { label: 'porn', effect: 'hide', cause: 'adult-disabled' },
        { label: 'nudity', effect: 'show', cause: 'dial' }
      ]
    })
    expect(reasons).toEqual(['Explicit / pornographic: hidden because adult content is turned off'])
  })

  it('prepends a platform line when the platform filtered it', () => {
    const reasons = filterReasons(
      { visibility: 'blur', reasons: [{ label: 'sexual', effect: 'blur', cause: 'dial' }] },
      true
    )
    expect(reasons[0]).toBe('Flagged by a platform safety decision')
    expect(reasons).toHaveLength(2)
  })
})
