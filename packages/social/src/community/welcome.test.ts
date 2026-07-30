import { describe, expect, it } from 'vitest'
import { isAnswered, markFirstPosts, welcomeQueue, type WelcomeCandidate } from './welcome'

const NOW = 1_000_000

const candidate = (over: Partial<WelcomeCandidate> = {}): WelcomeCandidate => ({
  postId: 'p1',
  authorDid: 'did:key:alice',
  createdAt: NOW - 1000,
  replyCount: 0,
  isFirstPost: true,
  ...over
})

describe('welcomeQueue', () => {
  it('surfaces unanswered first posts', () => {
    const queue = welcomeQueue([candidate()], NOW)
    expect(queue).toHaveLength(1)
    expect(queue[0]!.waitingMs).toBe(1000)
  })

  it('drops a first post once someone has replied', () => {
    expect(welcomeQueue([candidate({ replyCount: 1 })], NOW)).toHaveLength(0)
  })

  it('ignores posts from people who have posted before', () => {
    expect(welcomeQueue([candidate({ isFirstPost: false })], NOW)).toHaveLength(0)
  })

  it('puts the longest-waiting newcomer first', () => {
    const queue = welcomeQueue(
      [
        candidate({ postId: 'recent', authorDid: 'did:key:c', createdAt: NOW - 100 }),
        candidate({ postId: 'oldest', authorDid: 'did:key:a', createdAt: NOW - 9000 }),
        candidate({ postId: 'middle', authorDid: 'did:key:b', createdAt: NOW - 500 })
      ],
      NOW
    )
    expect(queue.map((e) => e.postId)).toEqual(['oldest', 'middle', 'recent'])
  })

  // The queue is a stewardship surface, not a ranking one: it must never
  // order by anything but waiting time (Charter §3).
  it('never reorders by reply count', () => {
    const queue = welcomeQueue(
      [
        candidate({ postId: 'a', authorDid: 'did:key:a', createdAt: NOW - 200 }),
        candidate({ postId: 'b', authorDid: 'did:key:b', createdAt: NOW - 100 })
      ],
      NOW
    )
    expect(queue.map((e) => e.postId)).toEqual(['a', 'b'])
  })

  it('never reports a negative wait for a clock-skewed future post', () => {
    const queue = welcomeQueue([candidate({ createdAt: NOW + 5000 })], NOW)
    expect(queue[0]!.waitingMs).toBe(0)
  })
})

describe('isAnswered', () => {
  it('treats any other-authored reply as an answer', () => {
    expect(isAnswered({ replyCount: 0 })).toBe(false)
    expect(isAnswered({ replyCount: 1 })).toBe(true)
  })
})

describe('markFirstPosts', () => {
  const post = (postId: string, authorDid: string, createdAt: number) => ({
    postId,
    authorDid,
    createdAt,
    replyCount: 0
  })

  it("marks only each author's earliest post", () => {
    const marked = markFirstPosts([
      post('a1', 'did:key:alice', 100),
      post('a2', 'did:key:alice', 200),
      post('b1', 'did:key:bob', 150)
    ])
    expect(marked.find((p) => p.postId === 'a1')!.isFirstPost).toBe(true)
    expect(marked.find((p) => p.postId === 'a2')!.isFirstPost).toBe(false)
    expect(marked.find((p) => p.postId === 'b1')!.isFirstPost).toBe(true)
  })

  it('does not depend on input order', () => {
    const marked = markFirstPosts([
      post('a2', 'did:key:alice', 200),
      post('a1', 'did:key:alice', 100)
    ])
    expect(marked.find((p) => p.postId === 'a1')!.isFirstPost).toBe(true)
    expect(marked.find((p) => p.postId === 'a2')!.isFirstPost).toBe(false)
  })

  it('composes with welcomeQueue end to end', () => {
    const queue = welcomeQueue(
      markFirstPosts([
        post('alice-first', 'did:key:alice', NOW - 5000),
        post('alice-second', 'did:key:alice', NOW - 100),
        post('bob-first', 'did:key:bob', NOW - 3000)
      ]),
      NOW
    )
    // Alice's second post is not a first post, so it never enters the queue.
    expect(queue.map((e) => e.postId)).toEqual(['alice-first', 'bob-first'])
  })
})
