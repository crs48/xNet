/**
 * CommentPlugin - ProseMirror plugin for comment interactions.
 *
 * Handles:
 * - Click on comment mark -> open full thread
 * - Hover on comment mark -> show preview
 * - Mouse leave -> dismiss preview
 * - Selected class decoration for active comment
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const CommentPluginKey = new PluginKey('commentInteractions')

export interface CommentPluginOptions {
  /** Called when a comment mark is clicked */
  onClickComment?: (commentId: string, anchorEl: HTMLElement) => void
  /** Called when hovering over a comment mark */
  onHoverComment?: (commentId: string, anchorEl: HTMLElement) => void
  /** Called when mouse leaves a comment mark */
  onLeaveComment?: () => void
  /** The currently selected/active comment ID (for styling) */
  selectedCommentId?: string | null
}

interface CommentPluginState {
  selectedCommentId: string | null
}

export const CommentPlugin = Extension.create<CommentPluginOptions>({
  name: 'commentPlugin',

  addOptions() {
    return {
      onClickComment: undefined,
      onHoverComment: undefined,
      onLeaveComment: undefined,
      selectedCommentId: null
    }
  },

  addProseMirrorPlugins() {
    const extension = this

    return [
      new Plugin<CommentPluginState>({
        key: CommentPluginKey,

        state: {
          init(): CommentPluginState {
            return { selectedCommentId: extension.options.selectedCommentId ?? null }
          },
          apply(tr, state): CommentPluginState {
            // Check for meta updates
            const newSelected = tr.getMeta(CommentPluginKey)
            if (newSelected !== undefined) {
              return { selectedCommentId: newSelected }
            }
            return state
          }
        },

        props: {
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement
            const commentSpan = target.closest('[data-comment]') as HTMLElement

            if (commentSpan && extension.options.onClickComment) {
              const commentId = commentSpan.getAttribute('data-comment-id')
              if (commentId) {
                extension.options.onClickComment(commentId, commentSpan)
                // Return false so ProseMirror still places the caret at the
                // click position. The popover is shown as a side-effect.
                return false
              }
            }
            return false
          },

          handleDOMEvents: {
            mouseover(view, event) {
              const target = event.target as HTMLElement
              const commentSpan = target.closest('[data-comment]') as HTMLElement

              if (commentSpan && extension.options.onHoverComment) {
                const commentId = commentSpan.getAttribute('data-comment-id')
                if (commentId) {
                  extension.options.onHoverComment(commentId, commentSpan)
                }
              }
              return false
            },

            mouseout(view, event) {
              const target = event.target as HTMLElement
              const relatedTarget = event.relatedTarget as HTMLElement | null

              // Only fire leave if we're leaving comment spans entirely
              if (
                target.closest('[data-comment]') &&
                !relatedTarget?.closest('[data-comment]') &&
                extension.options.onLeaveComment
              ) {
                extension.options.onLeaveComment()
              }
              return false
            }
          },

          decorations(state) {
            const pluginState = CommentPluginKey.getState(state) as CommentPluginState | undefined
            const selectedId = pluginState?.selectedCommentId

            if (!selectedId) {
              return DecorationSet.empty
            }

            const decorations: Decoration[] = []

            state.doc.descendants((node, pos) => {
              const commentMark = node.marks.find(
                (m) => m.type.name === 'comment' && m.attrs.commentId === selectedId
              )

              if (commentMark) {
                decorations.push(
                  Decoration.inline(pos, pos + node.nodeSize, {
                    class: 'xnet-comment-selected'
                  })
                )
              }
            })

            return DecorationSet.create(state.doc, decorations)
          }
        }
      })
    ]
  }
})

/**
 * Set the selected comment ID in the plugin state.
 * @param view - An EditorView-compatible object (uses `any` to avoid strict type conflicts)
 * @param commentId - Comment ID to select, or null to clear selection
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSelectedComment(view: any, commentId: string | null) {
  const tr = view.state.tr.setMeta(CommentPluginKey, commentId)
  view.dispatch(tr)
}

/**
 * Get all comment IDs at a given document position (for overlapping comments).
 */
export function getCommentsAtPosition(
  state: {
    doc: {
      resolve: (pos: number) => {
        marks: () => Array<{ type: { name: string }; attrs: { commentId: string } }>
      }
    }
  },
  pos: number
): string[] {
  const resolvedPos = state.doc.resolve(pos)
  const marks = resolvedPos.marks()

  return marks
    .filter((m: { type: { name: string } }) => m.type.name === 'comment')
    .map((m: { attrs: { commentId: string } }) => m.attrs.commentId)
}
