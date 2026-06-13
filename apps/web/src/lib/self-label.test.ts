import { decideSensitivityVisibility } from '@xnetjs/abuse'
import { describe, expect, it } from 'vitest'
import { moderationRowToAbuseLabel } from './self-label'

describe('moderationRowToAbuseLabel', () => {
  it('maps a persisted moderation label row to an AbuseLabel', () => {
    const label = moderationRowToAbuseLabel({
      id: 'lbl-1',
      target: 'node-1',
      value: 'porn',
      sourceDID: 'did:key:abc',
      sourceType: 'user',
      confidence: 1,
      sourceWeight: 0.5
    })
    expect(label).toMatchObject({
      id: 'lbl-1',
      value: 'porn',
      sourceDID: 'did:key:abc',
      confidence: 1,
      sourceWeight: 0.5
    })
  })

  it('feeds into the sensitivity dial: a self-labelled porn node hides by default', () => {
    const label = moderationRowToAbuseLabel({
      id: 'lbl-2',
      value: 'porn',
      confidence: 1,
      sourceWeight: 0.5
    })
    // default prefs: adult content disabled → hide
    expect(decideSensitivityVisibility([label])).toBe('hide')
    // adult enabled, dialed to warn
    expect(
      decideSensitivityVisibility([label], {
        adultContentEnabled: true,
        ageConfirmed: true,
        labels: { porn: 'warn' }
      })
    ).toBe('warn')
  })

  it('defaults missing numeric fields safely', () => {
    const label = moderationRowToAbuseLabel({ value: 'sexual' })
    expect(label.confidence).toBe(1)
    expect(label.sourceWeight).toBe(1)
  })
})
