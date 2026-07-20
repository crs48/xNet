/**
 * Host-facing actions for BlockNote's inline comment threads (0375).
 *
 * BlockNote's own comment UI is disabled (`BlockNoteView comments={false}`) so
 * the app renders exactly one comment surface — CommentIsland. That UI has to
 * be able to do what BlockNote's FloatingComposer did, which is more than
 * writing a comment node: `createThread` also applies the `.bn-thread-mark` to
 * the current selection. Persisting through the thread store alone would leave
 * a comment with nothing highlighting it in the document.
 *
 * These wrap the extension so the app never imports `@blocknote/core/comments`
 * directly.
 */
import { CommentsExtension } from '@blocknote/core/comments'
import type { XNetEditorInstance } from '../schema'
import { textToCommentBody } from './xnet-thread-store'

type EditorLike = Pick<XNetEditorInstance, 'getExtension'>

/**
 * The extension is absent when the host mounted the editor without a
 * `comments` prop (e.g. a read-only or comment-free surface), so every action
 * here degrades to a no-op rather than throwing.
 */
function commentsExtension(editor: EditorLike) {
  return editor.getExtension(CommentsExtension) ?? null
}

/**
 * Create a thread on the current selection from plain text, applying the
 * in-document mark. Resolves once the thread store has persisted it.
 */
export async function createInlineCommentThread(editor: EditorLike, text: string): Promise<void> {
  const extension = commentsExtension(editor)
  if (!extension) return
  const body = textToCommentBody(text)
  await extension.createThread({ initialComment: { body } })
}

/** Discard a staged (pending) comment without creating a thread. */
export function cancelInlineCommentThread(editor: EditorLike): void {
  commentsExtension(editor)?.stopPendingComment()
}

/** Clear the caret-inside-a-mark selection, so the island can close. */
export function clearSelectedInlineThread(editor: EditorLike): void {
  commentsExtension(editor)?.selectThread(undefined)
}
