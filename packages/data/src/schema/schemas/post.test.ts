import { describe, expect, it } from 'vitest'
import { PostSchema, comparePostsForFeed } from './post'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

describe('PostSchema', () => {
  it('is forum-shaped: a titled topic with a rich body', () => {
    expect(PostSchema.schema.name).toBe('Post')
    expect(PostSchema.schema.document).toBe('yjs')
    const post = PostSchema.create({ title: 'Welcome' }, { createdBy: testDID })
    expect(post.title).toBe('Welcome')
    expect(post.schemaId).toBe('xnet://xnet.fyi/Post@1.0.0')
    expect(post.pinned).toBe(false)
    expect(post.locked).toBe(false)
  })

  it('uses the space contributor policy — post freely, edit only your own', () => {
    const actions = PostSchema.schema.authorization?.actions
    expect(actions).toBeDefined()

    // Anyone admitted to the Space may start a topic.
    expect(actions?.create).toMatchObject({
      roles: ['spaceOwner', 'spaceAdmin', 'spaceMember']
    })
    // `owner` (the creator role) must NOT appear in `create` — a creator who
    // could grant themselves creation rights makes the admission gate vacuous
    // (see space-authorization.ts).
    expect(actions?.create).not.toMatchObject({ roles: expect.arrayContaining(['owner']) })

    // ...but only the author, or a space admin/owner, may edit it.
    expect(actions?.update).toMatchObject({ roles: ['owner', 'spaceOwner', 'spaceAdmin'] })

    // Viewers and commenters can read without being able to post.
    expect(actions?.read).toMatchObject({
      roles: expect.arrayContaining(['spaceViewer', 'spaceCommenter'])
    })
  })

  // Charter §3: a community feed orders by time and explicit editorial acts,
  // never by engagement. `pinned` is the only lever and it is a human choice.
  it('carries no score, rank or engagement field', () => {
    const props = Object.keys(PostSchema._properties)
    for (const banned of ['score', 'rank', 'points', 'votes', 'upvotes', 'hotness', 'trending']) {
      expect(props).not.toContain(banned)
    }
  })
})

describe('comparePostsForFeed', () => {
  const post = (pinned: boolean | undefined, createdAt: number) =>
    ({ pinned, createdAt }) as Parameters<typeof comparePostsForFeed>[0]

  it('sorts pinned topics above the rest', () => {
    expect(comparePostsForFeed(post(true, 1), post(false, 999))).toBeLessThan(0)
  })

  it('sorts newest first within the same pin state', () => {
    expect(comparePostsForFeed(post(false, 200), post(false, 100))).toBeLessThan(0)
    expect(comparePostsForFeed(post(true, 200), post(true, 100))).toBeLessThan(0)
  })

  it('treats an absent pinned flag exactly like false, not as a third state', () => {
    expect(comparePostsForFeed(post(undefined, 200), post(false, 100))).toBeLessThan(0)
    expect(comparePostsForFeed(post(false, 100), post(undefined, 200))).toBeGreaterThan(0)
    expect(comparePostsForFeed(post(undefined, 100), post(false, 100))).toBe(0)
  })

  it('is a total order — sorting is stable and pinned-first', () => {
    const feed = [post(false, 300), post(true, 100), post(undefined, 400), post(true, 200)]
    const sorted = [...feed].sort(comparePostsForFeed)
    expect(sorted.map((p) => p.createdAt)).toEqual([200, 100, 400, 300])
  })
})
