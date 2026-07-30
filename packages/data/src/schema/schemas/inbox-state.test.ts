import type { DID } from '../node'
import { describe, it, expect } from 'vitest'
import { InboxStateSchema, inboxStateNodeId } from './inbox-state'
import { didFromProfileNodeId, ProfileSchema, profileNodeId } from './profile'

const alice = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

describe('ProfileSchema', () => {
  it('creates a profile for a DID', () => {
    const profile = ProfileSchema.create(
      { did: alice, displayName: 'Alice', statusEmoji: '🌴' },
      { createdBy: alice }
    )
    expect(profile.schemaId).toBe('xnet://xnet.fyi/Profile@1.0.0')
    expect(profile.did).toBe(alice)
    expect(profile.displayName).toBe('Alice')
    expect(ProfileSchema.validate(profile).valid).toBe(true)
  })

  it('requires displayName', () => {
    const invalid = ProfileSchema.create({ did: alice } as never, { createdBy: alice })
    expect(ProfileSchema.validate(invalid).valid).toBe(false)
  })

  it('accepts a small inline data-URL avatar', () => {
    const avatar = `data:image/jpeg;base64,${'A'.repeat(10_000)}`
    const profile = ProfileSchema.create(
      { did: alice, displayName: 'Alice', avatar },
      { createdBy: alice, id: profileNodeId(alice) }
    )
    expect(ProfileSchema.validate(profile).valid).toBe(true)
  })

  it('profileNodeId is deterministic and round-trips the DID', () => {
    expect(profileNodeId(alice)).toBe(`profile-${alice}`)
    expect(profileNodeId(alice)).toBe(profileNodeId(alice))
    expect(didFromProfileNodeId(profileNodeId(alice))).toBe(alice)
    expect(didFromProfileNodeId('inbox-did:key:z6Mk')).toBeNull()
    expect(didFromProfileNodeId('profile-not-a-did')).toBeNull()
  })
})

describe('InboxStateSchema', () => {
  it('creates user-owned state with watermarks, acks, items, prefs', () => {
    const state = InboxStateSchema.create(
      {
        owner: alice,
        watermarks: { 'chan-1': { at: 1000, nodeId: 'msg-9' } },
        ackedMentions: ['msg-5'],
        items: { 'msg-5': { state: 'done' }, 'msg-7': { snoozedUntil: 2000 } },
        prefs: { channels: { 'chan-2': 'muted' }, keywords: ['outage'] }
      },
      { createdBy: alice, id: inboxStateNodeId(alice) }
    )
    expect(state.id).toBe(`inbox-${alice}`)
    expect(state.owner).toBe(alice)
    expect(state.watermarks?.['chan-1']?.at).toBe(1000)
    expect(state.ackedMentions).toContain('msg-5')
    expect(state.items?.['msg-7']?.snoozedUntil).toBe(2000)
    expect(state.prefs?.channels?.['chan-2']).toBe('muted')
    expect(InboxStateSchema.validate(state).valid).toBe(true)
  })

  it('inboxStateNodeId is deterministic per DID', () => {
    expect(inboxStateNodeId(alice)).toBe(inboxStateNodeId(alice))
    expect(inboxStateNodeId(alice)).not.toBe(inboxStateNodeId('did:key:zOther'))
  })
})
