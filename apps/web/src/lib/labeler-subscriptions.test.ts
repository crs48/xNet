import { describe, expect, it } from 'vitest'
import { rowToSubscriptionView, viewsToTrustSettings } from './labeler-subscriptions'

describe('rowToSubscriptionView', () => {
  it('maps a PolicySubscription row to a view with defaults', () => {
    const view = rowToSubscriptionView({
      id: 'sub-1',
      policyList: 'did:key:zLabeler',
      subscriber: 'did:key:zMe',
      trust: 0.8,
      scope: 'community',
      enabled: true
    })
    expect(view).toEqual({
      id: 'sub-1',
      labelerDID: 'did:key:zLabeler',
      trust: 0.8,
      enabled: true,
      scope: 'community'
    })
  })

  it('treats a missing enabled flag as enabled and missing trust as 0.5', () => {
    const view = rowToSubscriptionView({ id: 'x', policyList: 'did:key:z' })
    expect(view.enabled).toBe(true)
    expect(view.trust).toBe(0.5)
  })
})

describe('viewsToTrustSettings', () => {
  it('projects enabled subscriptions to runtime trust settings', () => {
    const settings = viewsToTrustSettings(
      [
        { id: 'a', labelerDID: 'did:key:zTrusted', trust: 0.9, enabled: true, scope: 'community' },
        { id: 'b', labelerDID: 'did:key:zOff', trust: 0.9, enabled: false, scope: 'community' }
      ],
      'did:key:zMe'
    )
    expect(settings).toHaveLength(2)
    const trusted = settings.find((s) => s.labelerDID === 'did:key:zTrusted')
    const off = settings.find((s) => s.labelerDID === 'did:key:zOff')
    expect(trusted?.level).toBe('trusted')
    expect(trusted?.scopeId).toBe('did:key:zMe')
    // disabled subscriptions are kept but mapped to `blocked` so they suppress.
    expect(off?.level).toBe('blocked')
  })
})
