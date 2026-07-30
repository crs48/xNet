import { describe, expect, it } from 'vitest'
import { collectWorkspacePeople } from './workspace-people'

const me = 'did:key:z6Mkme'

describe('collectWorkspacePeople', () => {
  it('aggregates self, assignees, and project leads without duplicates', () => {
    const people = collectWorkspacePeople(
      me,
      [
        { assignee: 'did:key:a', assignees: ['did:key:a', 'did:key:b'] },
        { assignees: [me] },
        { assignee: 7, assignees: 'nope' }
      ],
      [{ lead: 'did:key:c' }, { lead: '' }, {}]
    )

    expect(people.map((p) => p.did)).toEqual([me, 'did:key:a', 'did:key:b', 'did:key:c'])
    expect(people[0]).toEqual({ did: me, isSelf: true, name: 'Me' })
    expect(people[1]?.isSelf).toBeUndefined()
  })

  it('works without an identity', () => {
    expect(collectWorkspacePeople(null, [], [])).toEqual([])
  })

  it('resolves names and @handles from profiles, including self (0172)', () => {
    const people = collectWorkspacePeople(
      me,
      [{ assignee: 'did:key:a' }],
      [],
      [
        { did: me, name: 'Ada Lovelace', handle: 'ada' },
        { did: 'did:key:b', name: 'Bob', handle: 'bob' }
      ]
    )

    expect(people).toEqual([
      { did: me, name: 'Ada Lovelace', handle: 'ada', isSelf: true },
      { did: 'did:key:a' },
      { did: 'did:key:b', name: 'Bob', handle: 'bob' }
    ])
  })
})
