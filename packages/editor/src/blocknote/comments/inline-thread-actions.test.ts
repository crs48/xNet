import { describe, expect, it, vi } from 'vitest'
import {
  cancelInlineCommentThread,
  clearSelectedInlineThread,
  createInlineCommentThread
} from './inline-thread-actions'

/**
 * A stand-in for the BlockNote editor exposing just `getExtension`. The real
 * extension is only reachable from a mounted editor, and these wrappers exist
 * precisely so the app never touches it directly — so the contract worth
 * pinning is "delegates to the extension, and no-ops when absent".
 */
function fakeEditor(extension: unknown) {
  return { getExtension: vi.fn(() => extension) } as never
}

describe('inline thread actions', () => {
  it('creates a thread through the extension, not the thread store', async () => {
    // createThread is what also applies the in-document mark; writing straight
    // to the store would leave a comment with nothing highlighting it (0375).
    const createThread = vi.fn(async () => {})
    await createInlineCommentThread(fakeEditor({ createThread }), 'ship tokens first')

    expect(createThread).toHaveBeenCalledTimes(1)
    const arg = createThread.mock.calls[0][0] as { initialComment: { body: unknown } }
    expect(arg.initialComment.body).toBeDefined()
  })

  it('converts plain text into a BlockNote comment body', async () => {
    const createThread = vi.fn(async () => {})
    await createInlineCommentThread(fakeEditor({ createThread }), 'hello')

    const arg = createThread.mock.calls[0][0] as { initialComment: { body: unknown } }
    // Body round-trips through textToCommentBody — block JSON, not a raw string.
    expect(Array.isArray(arg.initialComment.body)).toBe(true)
    expect(JSON.stringify(arg.initialComment.body)).toContain('hello')
  })

  it('cancels a pending comment', () => {
    const stopPendingComment = vi.fn()
    cancelInlineCommentThread(fakeEditor({ stopPendingComment }))
    expect(stopPendingComment).toHaveBeenCalledTimes(1)
  })

  it('clears the selected thread', () => {
    const selectThread = vi.fn()
    clearSelectedInlineThread(fakeEditor({ selectThread }))
    expect(selectThread).toHaveBeenCalledWith(undefined)
  })

  it('no-ops when the comments extension is absent', async () => {
    // Editors mounted without a `comments` host have no extension; these must
    // not throw.
    await expect(createInlineCommentThread(fakeEditor(undefined), 'x')).resolves.toBeUndefined()
    expect(() => cancelInlineCommentThread(fakeEditor(undefined))).not.toThrow()
    expect(() => clearSelectedInlineThread(fakeEditor(undefined))).not.toThrow()
  })
})
