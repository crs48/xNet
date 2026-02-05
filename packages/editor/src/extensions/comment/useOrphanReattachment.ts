/**
 * useOrphanReattachment - Hook to auto-reattach orphaned comment anchors.
 *
 * When text is deleted and then restored via undo, this hook detects if any
 * previously orphaned text anchors now resolve again and restores their marks.
 *
 * @example
 * ```tsx
 * const { orphanedIds, recheckOrphaned } = useOrphanReattachment(editor, comments)
 *
 * // On editor content change (after undo)
 * useEffect(() => {
 *   const reattached = recheckOrphaned()
 *   // reattached is array of comment IDs that were restored
 * }, [editor.state.doc])
 * ```
 */
import type { Editor } from '@tiptap/core'
import { useCallback, useRef, useState, useEffect } from 'react'
import { resolveTextAnchor } from './textAnchor'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OrphanedComment {
  id: string
  anchorType: string
  anchorData: string
  resolved?: boolean
}

export interface UseOrphanReattachmentOptions {
  /** The TipTap editor instance */
  editor: Editor | null
  /** List of orphaned comments to watch */
  orphanedComments: OrphanedComment[]
  /** Callback when a comment is reattached */
  onReattach?: (commentId: string) => void
}

export interface UseOrphanReattachmentResult {
  /** Current list of orphaned comment IDs */
  orphanedIds: string[]
  /** Manually trigger a recheck of orphaned anchors */
  recheckOrphaned: () => string[]
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useOrphanReattachment({
  editor,
  orphanedComments,
  onReattach
}: UseOrphanReattachmentOptions): UseOrphanReattachmentResult {
  const [orphanedIds, setOrphanedIds] = useState<string[]>(() => orphanedComments.map((c) => c.id))

  // Track orphaned comments in a ref for callback stability
  const orphanedRef = useRef(orphanedComments)
  orphanedRef.current = orphanedComments

  // Update orphaned IDs when props change
  useEffect(() => {
    setOrphanedIds(orphanedComments.map((c) => c.id))
  }, [orphanedComments])

  /**
   * Check if any orphaned text anchors can now be resolved.
   * If so, restore their marks and return the reattached IDs.
   */
  const recheckOrphaned = useCallback((): string[] => {
    if (!editor?.view) return []

    const reattached: string[] = []
    const stillOrphaned: string[] = []

    for (const comment of orphanedRef.current) {
      // Only handle text anchors
      if (comment.anchorType !== 'text') {
        stillOrphaned.push(comment.id)
        continue
      }

      try {
        const anchor = JSON.parse(comment.anchorData)
        const resolved = resolveTextAnchor(editor, anchor)

        if (resolved) {
          // Anchor is valid again - restore the mark
          const markType = editor.schema.marks.comment
          if (markType) {
            const { tr } = editor.state
            tr.addMark(
              resolved.from,
              resolved.to,
              markType.create({
                commentId: comment.id,
                resolved: comment.resolved ?? false
              })
            )
            editor.view.dispatch(tr)
          }

          reattached.push(comment.id)
          onReattach?.(comment.id)
        } else {
          stillOrphaned.push(comment.id)
        }
      } catch {
        // Invalid anchor data - keep as orphaned
        stillOrphaned.push(comment.id)
      }
    }

    if (reattached.length > 0) {
      setOrphanedIds(stillOrphaned)
    }

    return reattached
  }, [editor, onReattach])

  return {
    orphanedIds,
    recheckOrphaned
  }
}

/**
 * Standalone function to recheck orphaned anchors (for non-React contexts).
 * Returns array of comment IDs that were successfully reattached.
 */
export function recheckOrphanedAnchors(
  editor: Editor,
  orphanedComments: OrphanedComment[]
): string[] {
  const reattached: string[] = []

  for (const comment of orphanedComments) {
    if (comment.anchorType !== 'text') continue

    try {
      const anchor = JSON.parse(comment.anchorData)
      const resolved = resolveTextAnchor(editor, anchor)

      if (resolved) {
        const markType = editor.schema.marks.comment
        if (markType) {
          const { tr } = editor.state
          tr.addMark(
            resolved.from,
            resolved.to,
            markType.create({
              commentId: comment.id,
              resolved: comment.resolved ?? false
            })
          )
          editor.view.dispatch(tr)
        }
        reattached.push(comment.id)
      }
    } catch {
      // Invalid anchor - skip
    }
  }

  return reattached
}
