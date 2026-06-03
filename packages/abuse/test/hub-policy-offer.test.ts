import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import {
  activeHubPolicyServices,
  createHubPolicyServiceOffer,
  isSignedHubPolicyServiceOffer,
  publicAppealChannels,
  signHubPolicyServiceOffer,
  unsignedHubPolicyServiceOffer,
  validateHubPolicyServiceOffer,
  verifySignedHubPolicyServiceOffer
} from '../src'

describe('@xnetjs/abuse hub policy service offers', () => {
  it('signs and verifies a hub moderation service offer', () => {
    const hub = generateIdentity()
    const offer = createHubPolicyServiceOffer({
      id: 'hub-public-policy',
      hubDID: hub.identity.did,
      issuerDID: hub.identity.did,
      title: 'Public search hub policy',
      createdAt: 1_000,
      expiresAt: 90_000,
      moderation: {
        mode: 'hybrid',
        aiReview: {
          cloudModelsEnabled: true,
          maxCloudReviewMicroUsdPerDay: 10_000
        },
        labels: {
          trustedLabelerDIDs: ['did:key:labeler'],
          subscribedPolicyListIds: ['policy:blocklist:v1']
        }
      },
      services: [
        {
          service: 'public-write',
          enabled: true,
          authenticated: true,
          settlement: 'free'
        },
        {
          service: 'federation-query',
          enabled: true,
          endpoint: 'https://hub.example/xnet/federation',
          authenticated: true,
          settlement: 'reciprocal',
          reciprocalCreditRatio: 1
        },
        {
          service: 'appeal',
          enabled: true,
          endpoint: 'https://hub.example/xnet/appeals',
          authenticated: true,
          settlement: 'sponsored',
          sponsoredBy: 'hub-operator'
        }
      ],
      operatorContact: {
        displayName: 'Example Hub',
        homepageUrl: 'https://hub.example',
        email: 'moderation@hub.example',
        abuseReportUrl: 'https://hub.example/abuse',
        responseTimeHours: 48
      },
      appealChannels: [
        {
          kind: 'web-form',
          authenticated: true,
          url: 'https://hub.example/appeals',
          languages: ['en'],
          maxResponseTimeHours: 72
        },
        {
          kind: 'xnet-message',
          authenticated: true,
          recipientDID: hub.identity.did,
          minResponseTimeHours: 4,
          maxResponseTimeHours: 72
        }
      ],
      budgetHints: [
        {
          name: 'crawl-domain-hourly',
          workType: 'crawl',
          scope: 'domain',
          unitsPerWindow: 100,
          windowMs: 3_600_000
        }
      ],
      policyRefs: ['xnet://policies/hub-public-policy']
    })

    const signed = signHubPolicyServiceOffer(offer, hub.privateKey)

    expect(isSignedHubPolicyServiceOffer(signed)).toBe(true)
    expect(verifySignedHubPolicyServiceOffer(signed, 2_000)).toEqual({
      valid: true,
      errors: []
    })
    expect(signed.moderation.requireSignedWrites).toBe(true)
    expect(signed.moderation.aiReview.localModelsEnabled).toBe(true)
    expect(signed.moderation.aiReview.cloudModelsEnabled).toBe(true)
    expect(publicAppealChannels(signed)).toHaveLength(2)
    expect(unsignedHubPolicyServiceOffer(signed)).not.toHaveProperty('signature')
  })

  it('detects tampered service offer settings', () => {
    const hub = generateIdentity()
    const signed = signHubPolicyServiceOffer(
      createHubPolicyServiceOffer({
        id: 'hub-public-policy',
        hubDID: hub.identity.did,
        issuerDID: hub.identity.did,
        createdAt: 1_000,
        expiresAt: 90_000,
        services: [
          {
            service: 'crawl',
            enabled: true,
            authenticated: true,
            settlement: 'paid',
            costMicroUsdPerUnit: 5
          }
        ]
      }),
      hub.privateKey
    )

    const tampered = {
      ...signed,
      moderation: {
        ...signed.moderation,
        requireSignedWrites: false
      }
    }

    const result = verifySignedHubPolicyServiceOffer(tampered, 2_000)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('invalid-signature')
  })

  it('filters active services and validates budget hints', () => {
    const hub = generateIdentity()
    const offer = createHubPolicyServiceOffer({
      id: 'hub-public-policy',
      hubDID: hub.identity.did,
      issuerDID: hub.identity.did,
      createdAt: 1_000,
      expiresAt: 90_000,
      services: [
        {
          service: 'public-write',
          enabled: true,
          authenticated: true,
          settlement: 'free'
        },
        {
          service: 'ai-review',
          enabled: false,
          authenticated: true,
          settlement: 'paid',
          costMicroUsdPerUnit: 20
        }
      ],
      budgetHints: [
        {
          name: '',
          workType: 'cloud-review',
          scope: 'workspace',
          unitsPerWindow: 0,
          windowMs: 0
        }
      ]
    })

    const validation = validateHubPolicyServiceOffer(offer, 2_000)

    expect(activeHubPolicyServices(offer).map((service) => service.service)).toEqual([
      'public-write'
    ])
    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual([
      'budget-name-required',
      'budget-units-invalid',
      'budget-window-invalid'
    ])
  })

  it('rejects expired signed offers', () => {
    const hub = generateIdentity()
    const signed = signHubPolicyServiceOffer(
      createHubPolicyServiceOffer({
        id: 'expired-policy',
        hubDID: hub.identity.did,
        issuerDID: hub.identity.did,
        createdAt: 1_000,
        expiresAt: 2_000,
        services: [
          {
            service: 'labeler',
            enabled: true,
            authenticated: true,
            settlement: 'sponsored',
            sponsoredBy: 'community-fund'
          }
        ]
      }),
      hub.privateKey
    )

    expect(verifySignedHubPolicyServiceOffer(signed, 3_000)).toMatchObject({
      valid: false,
      errors: ['expired']
    })
  })

  it('requires usable appeal metadata when an appeal service is public', () => {
    const hub = generateIdentity()
    const missingChannelOffer = createHubPolicyServiceOffer({
      id: 'appeals-policy',
      hubDID: hub.identity.did,
      issuerDID: hub.identity.did,
      createdAt: 1_000,
      expiresAt: 90_000,
      services: [
        {
          service: 'appeal',
          enabled: true,
          authenticated: true,
          settlement: 'free'
        }
      ]
    })
    const invalidChannelOffer = createHubPolicyServiceOffer({
      id: 'appeals-policy',
      hubDID: hub.identity.did,
      issuerDID: hub.identity.did,
      createdAt: 1_000,
      expiresAt: 90_000,
      operatorContact: {
        email: 'not-an-email',
        responseTimeHours: 0
      },
      services: [
        {
          service: 'appeal',
          enabled: true,
          authenticated: true,
          settlement: 'free'
        }
      ],
      appealChannels: [
        {
          kind: 'email',
          authenticated: false,
          email: 'invalid'
        },
        {
          kind: 'web-form',
          authenticated: true
        }
      ]
    })

    expect(validateHubPolicyServiceOffer(missingChannelOffer, 2_000).errors).toContain(
      'appeal-channel-required'
    )
    expect(validateHubPolicyServiceOffer(invalidChannelOffer, 2_000).errors).toEqual([
      'operator-response-time-invalid',
      'operator-email-invalid',
      'appeal-email-invalid',
      'appeal-web-form-url-required'
    ])
  })
})
