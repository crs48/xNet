import { describe, expect, it } from 'vitest'
import {
  evaluateLabelerTrust,
  subscriptionToTrustSetting,
  subscriptionsToTrustSettings,
  type PolicySubscriptionTrustInput
} from './labeler-trust'

const SCOPE_ID = 'ws-1'

describe('subscriptionToTrustSetting', () => {
  it('maps a high-trust enabled subscription to a trusted runtime setting', () => {
    const sub: PolicySubscriptionTrustInput = {
      labelerDID: 'did:key:zLabeler',
      scope: 'community',
      trust: 0.9,
      enabled: true
    }
    const setting = subscriptionToTrustSetting(sub, SCOPE_ID)
    expect(setting).toMatchObject({
      scope: 'workspace', // non-hub scopes collapse to workspace-local
      scopeId: SCOPE_ID,
      labelerDID: 'did:key:zLabeler',
      level: 'trusted',
      weight: 0.9,
      minConfidence: 0.5
    })
  })

  it('maps hub scope through to the hub runtime scope', () => {
    const setting = subscriptionToTrustSetting(
      { labelerDID: 'did:key:zHub', scope: 'hub', trust: 0.5 },
      SCOPE_ID
    )
    expect(setting.scope).toBe('hub')
    expect(setting.level).toBe('review')
  })

  it('treats a disabled subscription as blocked', () => {
    const setting = subscriptionToTrustSetting(
      { labelerDID: 'did:key:zOff', trust: 0.9, enabled: false },
      SCOPE_ID
    )
    expect(setting.level).toBe('blocked')
  })

  it('clamps out-of-range trust and maps zero to blocked', () => {
    expect(subscriptionToTrustSetting({ labelerDID: 'x', trust: 5 }, SCOPE_ID).weight).toBe(1)
    expect(subscriptionToTrustSetting({ labelerDID: 'x', trust: 0 }, SCOPE_ID).level).toBe(
      'blocked'
    )
  })

  it('drops expired subscriptions when projecting many', () => {
    const subs: PolicySubscriptionTrustInput[] = [
      { labelerDID: 'did:key:zLive', trust: 0.8 },
      { labelerDID: 'did:key:zDead', trust: 0.8, expiresAt: 500 }
    ]
    const settings = subscriptionsToTrustSettings(subs, SCOPE_ID, 1000)
    expect(settings.map((s) => s.labelerDID)).toEqual(['did:key:zLive'])
  })

  it('produces a setting that evaluateLabelerTrust then accepts a confident label from', () => {
    const settings = subscriptionsToTrustSettings(
      [{ labelerDID: 'did:key:zTrusted', scope: 'community', trust: 0.9 }],
      SCOPE_ID,
      1000
    )
    const decision = evaluateLabelerTrust(
      {
        scope: 'workspace',
        scopeId: SCOPE_ID,
        labelerDID: 'did:key:zTrusted',
        labelValue: 'porn',
        confidence: 0.95,
        now: 1000
      },
      settings
    )
    expect(decision.accepted).toBe(true)
    expect(decision.effectiveWeight).toBeGreaterThan(0)
  })
})
