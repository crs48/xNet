import { decideSensitivityVisibility, subscriptionsToTrustSettings } from '@xnetjs/abuse'
import { describe, expect, it } from 'vitest'
import {
  applyLabelerTrustToRows,
  attributionText,
  groupTrustedLabelsByTarget
} from './content-labels-trust'

const ME = 'did:key:zMe'
const LABELER = 'did:key:zLabeler'

function trustFor(trust: number, enabled = true) {
  return subscriptionsToTrustSettings([{ labelerDID: LABELER, trust, enabled }], ME, 1000)
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'lbl',
    target: 'node-1',
    value: 'porn',
    sourceDID: LABELER,
    sourceType: 'labeler',
    confidence: 0.95,
    sourceWeight: 1,
    ...over
  }
}

describe('applyLabelerTrustToRows', () => {
  it('passes self/AI labels through untouched', () => {
    const result = applyLabelerTrustToRows(
      [row({ sourceType: 'user', sourceDID: ME, sourceWeight: 0.5 })],
      [],
      ME,
      1000
    )
    expect(result.labels).toHaveLength(1)
    expect(result.labels[0].sourceWeight).toBe(0.5)
    expect(result.attributions).toHaveLength(0)
  })

  it('drops a labeler label when the viewer is not subscribed', () => {
    const result = applyLabelerTrustToRows([row()], [], ME, 1000)
    expect(result.labels).toHaveLength(0)
    expect(result.attributions).toHaveLength(0)
  })

  it('keeps a subscribed labeler label and re-weights it by trust', () => {
    const result = applyLabelerTrustToRows([row()], trustFor(0.9), ME, 1000)
    expect(result.labels).toHaveLength(1)
    expect(result.labels[0].sourceWeight).toBeCloseTo(0.9)
    expect(result.attributions).toEqual([{ labelerDID: LABELER, value: 'porn' }])
  })

  it('drops a disabled subscription (mapped to blocked → not accepted)', () => {
    const result = applyLabelerTrustToRows([row()], trustFor(0.9, false), ME, 1000)
    expect(result.labels).toHaveLength(0)
  })

  it('keeps both a self label and a trusted labeler label', () => {
    const result = applyLabelerTrustToRows(
      [row({ id: 'a', sourceType: 'user', sourceDID: ME, sourceWeight: 0.5 }), row({ id: 'b' })],
      trustFor(0.9),
      ME,
      1000
    )
    expect(result.labels.map((l) => l.id).sort()).toEqual(['a', 'b'])
    expect(result.attributions).toHaveLength(1)
  })
})

describe('labeler trust → visibility (end-to-end decision)', () => {
  it('a subscribed labeler’s explicit label hides the content; unsubscribed does not', () => {
    // Subscribed → the labeler's porn label survives and drives the dial to hide
    // (default prefs: adult content disabled).
    const subscribed = applyLabelerTrustToRows([row()], trustFor(0.9), ME, 1000)
    expect(decideSensitivityVisibility(subscribed.labels)).toBe('hide')

    // Not subscribed → the label is dropped, so the content shows normally.
    const unsubscribed = applyLabelerTrustToRows([row()], [], ME, 1000)
    expect(unsubscribed.labels).toHaveLength(0)
    expect(decideSensitivityVisibility(unsubscribed.labels)).toBe('show')
  })
})

describe('groupTrustedLabelsByTarget', () => {
  it('groups rows by target, keeps only wanted ids, and trust-gates each group', () => {
    const rows = [
      row({ id: 'a', target: 'msg-1' }), // labeler, subscribed
      row({ id: 'b', target: 'msg-1', sourceType: 'user', sourceDID: ME, sourceWeight: 0.5 }),
      row({ id: 'c', target: 'msg-2' }), // labeler on a different target
      row({ id: 'd', target: 'msg-3' }) // not in the wanted set → excluded
    ]
    const grouped = groupTrustedLabelsByTarget(rows, ['msg-1', 'msg-2'], trustFor(0.9), ME, 1000)
    expect([...grouped.keys()].sort()).toEqual(['msg-1', 'msg-2'])
    expect(
      grouped
        .get('msg-1')
        ?.labels.map((l) => l.id)
        .sort()
    ).toEqual(['a', 'b'])
    expect(grouped.get('msg-1')?.attributions).toHaveLength(1)
    expect(grouped.has('msg-3')).toBe(false)
  })

  it('omits a target whose only labels are from an unsubscribed labeler', () => {
    const grouped = groupTrustedLabelsByTarget([row({ target: 'msg-1' })], ['msg-1'], [], ME, 1000)
    expect(grouped.get('msg-1')?.labels).toHaveLength(0)
  })
})

describe('attributionText', () => {
  it('returns undefined when nothing was applied', () => {
    expect(attributionText([])).toBeUndefined()
  })

  it('summarizes the contributing labelers', () => {
    expect(attributionText([{ labelerDID: 'did:key:zABCDEFGHIJKLMNOP', value: 'porn' }])).toMatch(
      /^via did:key:zABCD/
    )
  })

  it('collapses duplicates and counts overflow', () => {
    const text = attributionText([
      { labelerDID: 'did:key:zAAA1111111111', value: 'porn' },
      { labelerDID: 'did:key:zBBB2222222222', value: 'sexual' },
      { labelerDID: 'did:key:zCCC3333333333', value: 'nudity' }
    ])
    expect(text).toContain('+1')
  })
})
