import { createPolicyBlockList, signPolicyBlockList } from '@xnetjs/abuse'
import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { importBlocklist, parseSignedBlocklist } from './blocklist-import'
import { withMany } from './block-list'

function signedList(now = 1_000) {
  const issuer = generateIdentity()
  const list = createPolicyBlockList({
    id: 'community-blocks',
    scope: 'community',
    issuerDID: issuer.identity.did,
    createdAt: now,
    entries: [
      {
        subject: 'did:key:zBad',
        subjectType: 'did',
        action: 'reject',
        reason: 'spam',
        createdAt: now
      },
      {
        subject: 'did:key:zMuted',
        subjectType: 'did',
        action: 'hide',
        reason: 'noise',
        createdAt: now
      },
      {
        subject: 'example.com',
        subjectType: 'domain',
        action: 'reject',
        reason: 'd',
        createdAt: now
      },
      {
        subject: 'did:key:zExpired',
        subjectType: 'did',
        action: 'reject',
        reason: 'old',
        createdAt: now - 10,
        expiresAt: now - 1
      }
    ]
  })
  return signPolicyBlockList(list, issuer.privateKey)
}

describe('blocklist import', () => {
  it('rejects malformed or unsigned input', () => {
    expect(parseSignedBlocklist('not json')).toBeNull()
    expect(parseSignedBlocklist('{"v":1}')).toBeNull()
    const bad = importBlocklist('garbage')
    expect(bad.ok).toBe(false)
  })

  it('verifies a signed list and projects DID entries onto block states', () => {
    const result = importBlocklist(JSON.stringify(signedList()), 1_000)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // domain entry skipped, expired entry skipped; did entries mapped by action
    expect(result.blocks).toEqual([
      { did: 'did:key:zBad', state: 'blocked' },
      { did: 'did:key:zMuted', state: 'muted' }
    ])
  })

  it('rejects a tampered signature', () => {
    const signed = signedList()
    const tampered = JSON.stringify({ ...signed, issuerDID: 'did:key:zAttacker' })
    const result = importBlocklist(tampered)
    expect(result.ok).toBe(false)
  })

  it('applying the import hides those accounts via the block list', () => {
    const result = importBlocklist(JSON.stringify(signedList()), 1_000)
    if (!result.ok) return
    const list = withMany({ blocked: [], muted: [], restricted: [] }, result.blocks)
    expect(list.blocked).toContain('did:key:zBad')
    expect(list.muted).toContain('did:key:zMuted')
  })
})
