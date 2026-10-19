import { describe, expect, it } from 'vitest'
import { conversationPlan, requireDid, socialProfileUrl } from './model'
const me = 'did:key:z6MkiSameIdentity111111111111111' as const
const friend = 'did:key:z6MkiOtherIdentity11111111111111' as const

describe('community creation boundaries', () => {
  it('keeps a private circle independent of an organization and seeds actual membership edges', () => {
    const { operations } = conversationPlan({
      name: 'Friends',
      me,
      members: [friend, friend],
      kind: 'group',
      audience: 'private',
      id: 'one'
    })
    const creates = operations.filter((operation) => operation.type === 'create')
    expect(creates[0].data).toMatchObject({ visibility: 'private', owners: [me] })
    expect(creates[0].data).not.toHaveProperty('parent')
    expect(creates.filter((op) => op.schema._schemaId.includes('SpaceMembership'))).toHaveLength(2)
    expect(creates.at(-1)?.data).toMatchObject({ space: creates[0].id, visibility: 'inherit' })
  })
  it('makes a DM stable regardless of member ordering and refuses public DMs', () => {
    const a = conversationPlan({
      name: 'A',
      me,
      members: [friend],
      kind: 'dm',
      audience: 'public',
      id: 'one'
    })
    const b = conversationPlan({
      name: 'B',
      me: friend,
      members: [me],
      kind: 'dm',
      audience: 'private',
      id: 'two'
    })
    expect(a.channelId).toBe(b.channelId)
    expect(a.operations[0]).toMatchObject({ data: { visibility: 'private' } })
  })
  it('rejects self-only direct messages before writing any records', () => {
    expect(() =>
      conversationPlan({
        name: 'Self',
        me,
        members: [me],
        kind: 'dm',
        audience: 'private',
        id: 'one'
      })
    ).toThrow('one other person')
  })
  it('rejects malformed identities rather than turning them into apparent contacts', () => {
    expect(() => requireDid('alice@example.com')).toThrow('complete xNet identity')
    expect(() => requireDid('did:key:z')).toThrow()
  })
})

describe('social profile URLs', () => {
  it('normalizes only the selected provider', () => {
    expect(socialProfileUrl('bluesky', '@alice.bsky.social').url).toBe(
      'https://bsky.app/profile/alice.bsky.social'
    )
    expect(socialProfileUrl('twitter', 'https://twitter.com/alice').url).toBe('https://x.com/alice')
  })
  it.each([
    'javascript:alert(1)',
    'https://x.com.evil.example/alice',
    'https://alice@x.com/bob',
    'https://x.com/alice/status/1',
    'https://bsky.app/profile/alice.bsky.social'
  ])('rejects unsafe or non-X profiles: %s', (value) => {
    expect(() => socialProfileUrl('twitter', value)).toThrow()
  })
})
