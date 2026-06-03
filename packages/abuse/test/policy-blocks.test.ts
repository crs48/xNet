import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import {
  activePolicyBlockEntries,
  auditPolicyBlockEntries,
  createPolicyBlockList,
  findPolicyBlockAuditEntry,
  findPolicyBlockEntry,
  policyBlockEntryIsActive,
  resolveSubscribedPolicyBlockLists,
  signPolicyBlockList,
  unsignedPolicyBlockList,
  verifySignedPolicyBlockList
} from '../src'

describe('@xnetjs/abuse policy block lists', () => {
  it('signs and verifies a workspace block list', () => {
    const issuer = generateIdentity()
    const list = createPolicyBlockList({
      id: 'workspace-blocks',
      scope: 'workspace',
      issuerDID: issuer.identity.did,
      createdAt: 1_000,
      entries: [
        {
          subject: 'did:key:z6MkBlocked',
          subjectType: 'did',
          action: 'reject',
          reason: 'manual workspace block',
          createdAt: 1_000
        }
      ]
    })

    const signed = signPolicyBlockList(list, issuer.privateKey)

    expect(verifySignedPolicyBlockList(signed)).toEqual({ valid: true, errors: [] })
    expect(unsignedPolicyBlockList(signed)).not.toHaveProperty('signature')
  })

  it('detects tampered signed block entries', () => {
    const issuer = generateIdentity()
    const signed = signPolicyBlockList(
      createPolicyBlockList({
        id: 'local-blocks',
        scope: 'user',
        issuerDID: issuer.identity.did,
        createdAt: 1_000,
        entries: [
          {
            subject: 'peer-a',
            subjectType: 'peerId',
            action: 'block-peer',
            reason: 'repeat invalid signatures',
            createdAt: 1_000
          }
        ]
      }),
      issuer.privateKey
    )

    const tampered = {
      ...signed,
      entries: [{ ...signed.entries[0], subject: 'peer-b' }]
    }

    const result = verifySignedPolicyBlockList(tampered)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('invalid-signature')
  })

  it('filters expired entries and finds active subjects', () => {
    const list = createPolicyBlockList({
      id: 'local-blocks',
      scope: 'user',
      issuerDID: 'did:key:z6MkLocal',
      createdAt: 1_000,
      entries: [
        {
          subject: 'active-peer',
          subjectType: 'peerId',
          action: 'block-peer',
          reason: 'still active',
          createdAt: 1_000,
          expiresAt: 3_000
        },
        {
          subject: 'expired-peer',
          subjectType: 'peerId',
          action: 'block-peer',
          reason: 'expired',
          createdAt: 1_000,
          expiresAt: 1_500
        }
      ]
    })

    expect(activePolicyBlockEntries(list, 2_000).map((entry) => entry.subject)).toEqual([
      'active-peer'
    ])
    expect(policyBlockEntryIsActive(list.entries[0], 2_000)).toBe(true)
    expect(policyBlockEntryIsActive(list.entries[1], 2_000)).toBe(false)
    expect(findPolicyBlockEntry(list, 'active-peer', 'peerId', 2_000)?.reason).toBe('still active')
    expect(findPolicyBlockEntry(list, 'expired-peer', 'peerId', 2_000)).toBeNull()
  })

  it('keeps expired entries auditable after enforcement expiry', () => {
    const issuer = generateIdentity()
    const signed = signPolicyBlockList(
      createPolicyBlockList({
        id: 'hub-blocks',
        scope: 'hub',
        issuerDID: issuer.identity.did,
        createdAt: 1_000,
        entries: [
          {
            id: 'block-expired-peer',
            subject: 'expired-peer',
            subjectType: 'peerId',
            action: 'block-peer',
            reason: 'temporary invalid signature burst',
            evidenceRefs: ['xnet://evidence/invalid-signatures'],
            createdAt: 1_000,
            expiresAt: 1_500,
            autoBlock: true
          },
          {
            id: 'block-active-peer',
            subject: 'active-peer',
            subjectType: 'peerId',
            action: 'block-peer',
            reason: 'ongoing crawler abuse',
            evidenceRefs: ['xnet://evidence/crawler-abuse'],
            createdAt: 1_000,
            expiresAt: 3_000,
            autoBlock: true
          }
        ]
      }),
      issuer.privateKey
    )

    expect(verifySignedPolicyBlockList(signed)).toEqual({ valid: true, errors: [] })
    expect(activePolicyBlockEntries(signed, 2_000).map((entry) => entry.subject)).toEqual([
      'active-peer'
    ])
    expect(findPolicyBlockEntry(signed, 'expired-peer', 'peerId', 2_000)).toBeNull()

    const auditEntries = auditPolicyBlockEntries(signed, 2_000)
    expect(auditEntries).toEqual([
      {
        id: 'block-expired-peer',
        subject: 'expired-peer',
        subjectType: 'peerId',
        action: 'block-peer',
        reason: 'temporary invalid signature burst',
        evidenceRefs: ['xnet://evidence/invalid-signatures'],
        createdAt: 1_000,
        expiresAt: 1_500,
        autoBlock: true,
        active: false,
        expired: true
      },
      {
        id: 'block-active-peer',
        subject: 'active-peer',
        subjectType: 'peerId',
        action: 'block-peer',
        reason: 'ongoing crawler abuse',
        evidenceRefs: ['xnet://evidence/crawler-abuse'],
        createdAt: 1_000,
        expiresAt: 3_000,
        autoBlock: true,
        active: true,
        expired: false
      }
    ])
    expect(findPolicyBlockAuditEntry(signed, 'expired-peer', 'peerId', 2_000)).toEqual(
      auditEntries[0]
    )
  })

  it('keeps local overrides authoritative over subscribed shared policy lists', () => {
    const issuer = generateIdentity()
    const signed = signPolicyBlockList(
      createPolicyBlockList({
        id: 'community-shared-blocks',
        title: 'Community shared blocks',
        scope: 'community',
        issuerDID: issuer.identity.did,
        createdAt: 1_000,
        entries: [
          {
            id: 'shared-false-positive',
            subject: 'did:key:z6MkFalsePositive',
            subjectType: 'did',
            action: 'hide',
            reason: 'shared list report',
            evidenceRefs: ['report:shared-1'],
            createdAt: 1_000
          },
          {
            id: 'shared-active-spam',
            subject: 'did:key:z6MkSpam',
            subjectType: 'did',
            action: 'reject',
            reason: 'confirmed spammer',
            evidenceRefs: ['report:shared-2'],
            createdAt: 1_000
          }
        ]
      }),
      issuer.privateKey
    )

    const resolution = resolveSubscribedPolicyBlockLists({
      lists: [signed],
      localOverrides: [
        {
          id: 'allow-known-neighbor',
          subject: 'did:key:z6MkFalsePositive',
          subjectType: 'did',
          scope: 'user',
          reason: 'known local collaborator',
          evidenceRefs: ['local-note:neighbor'],
          createdAt: 1_500
        }
      ],
      now: 2_000
    })

    expect(verifySignedPolicyBlockList(signed)).toEqual({ valid: true, errors: [] })
    expect(resolution.enforcedEntries.map((entry) => entry.subject)).toEqual(['did:key:z6MkSpam'])
    expect(resolution.overriddenEntries).toEqual([
      {
        id: 'shared-false-positive',
        subject: 'did:key:z6MkFalsePositive',
        subjectType: 'did',
        action: 'hide',
        reason: 'shared list report',
        evidenceRefs: ['report:shared-1'],
        createdAt: 1_000,
        listId: 'community-shared-blocks',
        listScope: 'community',
        issuerDID: issuer.identity.did,
        overridden: true,
        overrideRefs: ['policy-override:user:allow-known-neighbor']
      }
    ])
    expect(resolution.activeOverrides).toHaveLength(1)
  })
})
