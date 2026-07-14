import { describe, expect, it, vi } from 'vitest'
import {
  XNetThreadStore,
  XNetThreadStoreAuth,
  commentBodyToText,
  textToCommentBody,
  toThreadData,
  type XNetCommentThread,
  type XNetThreadStoreHost
} from './xnet-thread-store'

const DID = 'did:key:z6MkAuthor'

function makeHost(overrides: Partial<XNetThreadStoreHost> = {}): XNetThreadStoreHost {
  return {
    addComment: vi.fn(async () => 'thread-1'),
    replyTo: vi.fn(async () => undefined),
    editComment: vi.fn(async () => undefined),
    deleteComment: vi.fn(async () => undefined),
    resolveThread: vi.fn(async () => undefined),
    reopenThread: vi.fn(async () => undefined),
    ...overrides
  }
}

function makeStore(host = makeHost()) {
  return new XNetThreadStore(host, DID, new XNetThreadStoreAuth(DID, 'editor'))
}

function thread(id: string, content: string, replies: string[] = []): XNetCommentThread {
  return {
    root: {
      id,
      createdAt: 1000,
      properties: { content, createdBy: DID, resolved: false, edited: false }
    },
    replies: replies.map((text, i) => ({
      id: `${id}-reply-${i}`,
      createdAt: 2000 + i,
      properties: { content: text, createdBy: DID, resolved: false, edited: false }
    }))
  }
}

describe('body mapping (text-only v1)', () => {
  it('flattens Block JSON bodies to plain text', () => {
    const body = [
      { type: 'paragraph', content: [{ type: 'text', text: 'line one', styles: {} }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'ping ', styles: {} },
          { type: 'mention', props: { id: DID, label: 'Ada' } }
        ]
      }
    ]
    expect(commentBodyToText(body)).toBe('line one\nping @Ada')
  })

  it('round-trips plain text through a single-paragraph body', () => {
    const body = textToCommentBody('hello world')
    expect(commentBodyToText(body)).toBe('hello world')
    expect(textToCommentBody('')).toEqual([{ type: 'paragraph', content: [] }])
  })
})

describe('toThreadData', () => {
  it('maps a 0276 thread (root + replies) onto ThreadData', () => {
    const data = toThreadData(thread('t1', 'root text', ['first reply']))
    expect(data.id).toBe('t1')
    expect(data.resolved).toBe(false)
    expect(data.comments).toHaveLength(2)
    expect(data.comments[0].userId).toBe(DID)
    expect(commentBodyToText(data.comments[0].body)).toBe('root text')
    expect(commentBodyToText(data.comments[1].body)).toBe('first reply')
    expect(data.updatedAt.getTime()).toBe(2000)
  })
})

describe('XNetThreadStore', () => {
  it('createThread writes through the host and returns optimistic data', async () => {
    const host = makeHost()
    const store = makeStore(host)
    const created = await store.createThread({
      initialComment: { body: textToCommentBody('a new note') }
    })
    expect(host.addComment).toHaveBeenCalledWith({
      content: 'a new note',
      anchorType: 'text',
      anchorData: JSON.stringify({ source: 'blocknote' })
    })
    expect(created.id).toBe('thread-1')
    expect(created.comments[0].userId).toBe(DID)
    expect(store.getThread('thread-1')).toBe(created)
  })

  it('setThreads replaces the map from the live query and notifies subscribers', () => {
    const store = makeStore()
    const seen: number[] = []
    store.subscribe((threads) => seen.push(threads.size))
    store.setThreads([thread('t1', 'one'), thread('t2', 'two')])
    expect(seen).toEqual([2])
    expect(store.getThreads().size).toBe(2)
    expect(store.getThread('t2').comments[0].userId).toBe(DID)
    expect(() => store.getThread('missing')).toThrow(/not found/)
  })

  it('routes reply/edit/resolve/unresolve through the 0276 CRUD', async () => {
    const host = makeHost()
    const store = makeStore(host)
    await store.addComment({ threadId: 't1', comment: { body: textToCommentBody('reply!') } })
    expect(host.replyTo).toHaveBeenCalledWith('t1', 'reply!')
    await store.updateComment({
      threadId: 't1',
      commentId: 'c9',
      comment: { body: textToCommentBody('edited') }
    })
    expect(host.editComment).toHaveBeenCalledWith('c9', 'edited')
    await store.resolveThread({ threadId: 't1' })
    expect(host.resolveThread).toHaveBeenCalledWith('t1')
    await store.unresolveThread({ threadId: 't1' })
    expect(host.reopenThread).toHaveBeenCalledWith('t1')
  })

  it('deleteThread removes replies before the root', async () => {
    const host = makeHost()
    const store = makeStore(host)
    store.setThreads([thread('t1', 'root', ['r0', 'r1'])])
    await store.deleteThread({ threadId: 't1' })
    const calls = (host.deleteComment as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(calls).toEqual(['t1-reply-0', 't1-reply-1', 't1'])
  })

  it('hides and refuses reactions (v1)', async () => {
    const store = makeStore()
    const auth = new XNetThreadStoreAuth(DID, 'editor')
    expect(auth.canAddReaction()).toBe(false)
    expect(auth.canDeleteReaction()).toBe(false)
    await expect(store.addReaction()).rejects.toThrow(/not supported/)
  })
})
