/**
 * Text anchor utilities for comments.
 *
 * Uses Yjs RelativePosition to create anchors that survive concurrent edits.
 * Position conversion uses y-tiptap's absolutePositionToRelativePosition /
 * relativePositionToAbsolutePosition which walk the Yjs tree properly,
 * creating positions on the actual Y.XmlText nodes (not the root fragment).
 */
import type { Editor } from '@tiptap/core'
import type { TextAnchor } from '@xnet/data'
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition
} from '@tiptap/y-tiptap'
import * as Y from 'yjs'

// ─── Base64 Utilities ──────────────────────────────────────────────────────────

/**
 * Convert Uint8Array to Base64 string for JSON storage.
 */
export function uint8ArrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
}

/**
 * Convert Base64 string back to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i)
  }
  return arr
}

// ─── Anchor Capture ────────────────────────────────────────────────────────────

/**
 * Capture a text anchor from the current editor selection.
 * Returns a TextAnchor that survives concurrent edits via Yjs RelativePosition.
 *
 * @returns TextAnchor or null if no selection or Yjs not available
 */
export function captureTextAnchor(editor: Editor): TextAnchor | null {
  const { from, to } = editor.state.selection

  if (from === to) return null // No selection

  // Get the Y.XmlFragment binding from y-prosemirror
  const ystate = ySyncPluginKey.getState(editor.state)
  if (!ystate?.type || !ystate?.binding) return null

  // Use y-tiptap's position mapping which walks the Yjs tree properly,
  // creating RelativePositions on the actual Y.XmlText nodes
  const mapping = ystate.binding.mapping
  const startRelPos = absolutePositionToRelativePosition(from, ystate.type, mapping)
  const endRelPos = absolutePositionToRelativePosition(to, ystate.type, mapping)

  if (!startRelPos || !endRelPos) return null

  // Encode as base64 for JSON storage
  const startRelative = uint8ArrayToBase64(Y.encodeRelativePosition(startRelPos))
  const endRelative = uint8ArrayToBase64(Y.encodeRelativePosition(endRelPos))

  // Capture the quoted text for fallback display if anchor becomes orphaned
  const quotedText = editor.state.doc.textBetween(from, to, ' ')

  return {
    startRelative,
    endRelative,
    quotedText
  }
}

// ─── Anchor Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a text anchor to absolute ProseMirror positions.
 * Returns null if the anchor is orphaned (text was deleted).
 *
 * @returns { from, to } or null if orphaned
 */
export function resolveTextAnchor(
  editor: Editor,
  anchor: TextAnchor
): { from: number; to: number } | null {
  const ystate = ySyncPluginKey.getState(editor.state)
  if (!ystate?.type || !ystate?.binding) return null

  const ydoc = ystate.type.doc
  if (!ydoc) return null

  try {
    // Decode relative positions
    const startRelPos = Y.decodeRelativePosition(base64ToUint8Array(anchor.startRelative))
    const endRelPos = Y.decodeRelativePosition(base64ToUint8Array(anchor.endRelative))

    // Use y-tiptap's position mapping which properly walks the tree,
    // handling positions on Y.XmlText nodes and computing ProseMirror offsets
    const mapping = ystate.binding.mapping
    const from = relativePositionToAbsolutePosition(ydoc, ystate.type, startRelPos, mapping)
    const to = relativePositionToAbsolutePosition(ydoc, ystate.type, endRelPos, mapping)

    if (from === null || to === null) return null // Orphaned

    return { from, to }
  } catch {
    // Invalid anchor data
    return null
  }
}

// ─── Mark Restoration ──────────────────────────────────────────────────────────

interface CommentForRestore {
  id: string
  properties: {
    anchorType: string
    anchorData: string
    resolved?: boolean
  }
}

/**
 * Restore comment marks from stored Comment nodes.
 * Called when a document is first opened.
 *
 * @param editor - The TipTap editor instance
 * @param comments - Array of Comment nodes to restore marks for
 * @returns Object with arrays of resolved and orphaned comment IDs
 */
export function restoreCommentMarks(
  editor: Editor,
  comments: CommentForRestore[]
): { resolved: string[]; orphaned: string[] } {
  const resolved: string[] = []
  const orphaned: string[] = []

  const { tr } = editor.state

  for (const comment of comments) {
    // Only process root comments with text anchors
    if (comment.properties.anchorType !== 'text') continue

    try {
      const anchor = JSON.parse(comment.properties.anchorData as string) as TextAnchor
      const positions = resolveTextAnchor(editor, anchor)

      if (positions) {
        // Apply the mark at the resolved position
        const markType = editor.schema.marks.comment
        if (markType) {
          tr.addMark(
            positions.from,
            positions.to,
            markType.create({
              commentId: comment.id,
              resolved: comment.properties.resolved ?? false
            })
          )
        }
        resolved.push(comment.id)
      } else {
        // Anchor is orphaned -- text was deleted
        orphaned.push(comment.id)
      }
    } catch {
      // Invalid anchor data
      orphaned.push(comment.id)
    }
  }

  if (tr.steps.length > 0) {
    editor.view.dispatch(tr)
  }

  return { resolved, orphaned }
}

// ─── Anchor Validation ─────────────────────────────────────────────────────────

/**
 * Check if a text anchor is valid (not orphaned).
 */
export function isTextAnchorValid(editor: Editor, anchor: TextAnchor): boolean {
  return resolveTextAnchor(editor, anchor) !== null
}
