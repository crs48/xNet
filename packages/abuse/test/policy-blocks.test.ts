import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import {
  activePolicyBlockEntries,
  createPolicyBlockList,
  findPolicyBlockEntry,
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
    expect(findPolicyBlockEntry(list, 'active-peer', 'peerId', 2_000)?.reason).toBe('still active')
    expect(findPolicyBlockEntry(list, 'expired-peer', 'peerId', 2_000)).toBeNull()
  })
})
