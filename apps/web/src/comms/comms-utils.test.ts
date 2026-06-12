import { describe, expect, it } from 'vitest'
import {
  channelHeaderModel,
  channelLabel,
  colorForDid,
  dedupeProfiles,
  displayName,
  mergeMentionables,
  profileFormValues,
  toggleTrackKind,
  userCardFrom
} from './comms-utils'

const alice = 'did:key:zAliceAliceAlice'
const bob = 'did:key:zBobBobBobBobBob'
const profiles = [
  { did: alice, name: 'Alice' },
  { did: bob, name: 'Bob' }
]

describe('displayName / colorForDid / userCardFrom', () => {
  it('resolves names from profiles and falls back to truncated DIDs', () => {
    expect(displayName(alice, profiles)).toBe('Alice')
    expect(displayName('did:key:zUnknown123', profiles)).toContain('…')
  })

  it('colors are deterministic per DID', () => {
    expect(colorForDid(alice)).toBe(colorForDid(alice))
  })

  it('userCardFrom merges profile fields', () => {
    expect(userCardFrom(alice, { displayName: 'Alice', avatar: 'a.png' })).toMatchObject({
      did: alice,
      name: 'Alice',
      avatar: 'a.png'
    })
    expect(userCardFrom(alice, undefined).name).toBeUndefined()
  })
})

describe('dedupeProfiles', () => {
  it('dedupes by DID keeping the first (newest) entry', () => {
    const result = dedupeProfiles([
      { did: alice, displayName: 'New Alice' },
      { did: alice, displayName: 'Old Alice' },
      { did: bob, displayName: 'Bob' },
      { displayName: 'no-did' }
    ])
    expect(result).toHaveLength(2)
    expect(result[0]?.name).toBe('New Alice')
  })

  it('handles null input', () => {
    expect(dedupeProfiles(null)).toEqual([])
  })
})

describe('channelLabel / channelHeaderModel', () => {
  it('names DMs after the other members', () => {
    const dm = { id: 'dm-1', kind: 'dm', members: [alice, bob] }
    expect(channelLabel(dm, alice, profiles)).toBe('Bob')
  })

  it('falls back to the channel name, then untitled', () => {
    expect(channelLabel({ id: 'c1', name: 'general' }, alice, profiles)).toBe('general')
    expect(channelLabel({ id: 'c2', name: '  ' }, alice, profiles)).toBe('untitled')
    expect(channelLabel({ id: 'dm-x', kind: 'dm', members: [alice] }, alice, profiles)).toBe(
      'untitled'
    )
  })

  it('builds the header model with defaults', () => {
    const model = channelHeaderModel({ id: 'c1', name: 'general', topic: ' t ' }, alice, profiles)
    expect(model).toEqual({ kind: 'channel', label: 'general', topic: 't' })
    expect(channelHeaderModel(null, alice, profiles).kind).toBe('channel')
  })
})

describe('mergeMentionables', () => {
  it('merges profiles with presence and removes self', () => {
    const peers = [
      { clientId: 1, user: { did: 'did:key:zCarolCarol', name: 'Carol' } },
      { clientId: 2, user: { did: bob, name: 'ignored (profile wins)' } }
    ]
    const result = mergeMentionables(profiles, peers, alice)
    expect(result.map((m) => m.label).sort()).toEqual(['Bob', 'Carol'])
  })
})

describe('profileFormValues', () => {
  it('maps fields with empty-string fallbacks', () => {
    expect(profileFormValues({ displayName: 'A', statusEmoji: '🌴' })).toEqual({
      name: 'A',
      emoji: '🌴',
      message: ''
    })
    expect(profileFormValues(null)).toEqual({ name: '', emoji: '', message: '' })
  })
})

describe('toggleTrackKind', () => {
  it('flips all tracks and reports the new state', () => {
    const tracks = [{ enabled: true }, { enabled: true }]
    expect(toggleTrackKind(tracks)).toBe(false)
    expect(tracks.every((t) => !t.enabled)).toBe(true)
    expect(toggleTrackKind([])).toBe(false)
  })
})
