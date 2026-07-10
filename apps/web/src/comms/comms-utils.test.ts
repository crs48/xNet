import { describe, expect, it } from 'vitest'
import {
  channelHeaderModel,
  channelLabel,
  colorForDid,
  dedupeProfiles,
  displayName,
  isHandleTaken,
  mentionLabel,
  mergeMentionables,
  normalizeHandle,
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
  it('merges profiles with presence and lists self last, flagged', () => {
    const peers = [
      { clientId: 1, user: { did: 'did:key:zCarolCarol', name: 'Carol' } },
      { clientId: 2, user: { did: bob, name: 'ignored (profile wins)' } }
    ]
    const result = mergeMentionables(profiles, peers, alice)
    expect(result.map((m) => m.label)).toEqual(['Bob', 'Carol', 'Alice'])
    expect(result.at(-1)).toMatchObject({ did: alice, isSelf: true })
    expect(result.slice(0, -1).every((m) => !m.isSelf)).toBe(true)
  })

  it('keeps the freshly saved @handle reachable for self-mentions', () => {
    const withHandle = [{ did: alice, name: 'Alice', handle: 'ada' }]
    const result = mergeMentionables(withHandle, [], alice)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ did: alice, handle: 'ada', isSelf: true })
  })

  it('omits self entirely when unknown to profiles and presence', () => {
    expect(mergeMentionables([], [], alice)).toEqual([])
  })
})

describe('profileFormValues', () => {
  it('maps fields with empty-string fallbacks', () => {
    expect(profileFormValues({ displayName: 'A', statusEmoji: '🌴' })).toEqual({
      name: 'A',
      handle: '',
      emoji: '🌴',
      message: ''
    })
    expect(profileFormValues({ displayName: 'A', handle: 'ada' })).toEqual({
      name: 'A',
      handle: 'ada',
      emoji: '',
      message: ''
    })
    expect(profileFormValues(null)).toEqual({ name: '', handle: '', emoji: '', message: '' })
  })
})

describe('handle helpers (0172)', () => {
  it('normalizes a raw handle to a workspace slug', () => {
    expect(normalizeHandle('  @Ada Lovelace! ')).toBe('adalovelace')
    expect(normalizeHandle('@@ada__dev-1')).toBe('ada__dev-1')
    expect(normalizeHandle('!!!')).toBe('')
    expect(normalizeHandle('x'.repeat(40))).toHaveLength(32)
  })

  it('detects a handle taken by another DID, ignoring the same DID', () => {
    const withHandles = [
      { did: alice, name: 'Alice', handle: 'ada' },
      { did: bob, name: 'Bob', handle: 'bob' }
    ]
    expect(isHandleTaken('ada', bob, withHandles)).toBe(true)
    expect(isHandleTaken('@Ada', bob, withHandles)).toBe(true) // normalized before compare
    expect(isHandleTaken('ada', alice, withHandles)).toBe(false) // own handle
    expect(isHandleTaken('fresh', bob, withHandles)).toBe(false)
    expect(isHandleTaken('', bob, withHandles)).toBe(false)
  })

  it('prefers the @handle over display name for mentions', () => {
    const withHandle = [{ did: alice, name: 'Alice Lovelace', handle: 'ada' }]
    expect(mentionLabel(alice, withHandle)).toBe('ada')
    expect(mentionLabel(bob, withHandle)).toBe(`${bob.slice(8, 14)}…`) // falls back
  })

  it('carries the handle through dedupeProfiles and mergeMentionables', () => {
    const deduped = dedupeProfiles([{ did: alice, displayName: 'Alice', handle: 'ada' }])
    expect(deduped[0].handle).toBe('ada')
    const mentionables = mergeMentionables(deduped, [], bob)
    expect(mentionables[0]).toMatchObject({ did: alice, label: 'Alice', handle: 'ada' })
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
