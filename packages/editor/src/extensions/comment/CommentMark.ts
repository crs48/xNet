/**
 * CommentMark - TipTap Mark extension for highlighting commented text.
 *
 * Features:
 * - Stores commentId as attribute
 * - Supports overlapping comments (excludes: '')
 * - Visual states: active, selected, resolved
 * - Commands: setComment, unsetComment, toggleComment
 */
import { Mark, mergeAttributes } from '@tiptap/core'

export interface CommentMarkOptions {
  /** HTML attributes for the wrapper */
  HTMLAttributes: Record<string, string>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      /** Apply a comment mark with the given commentId */
      setComment: (commentId: string) => ReturnType
      /** Remove a specific comment mark by commentId */
      unsetComment: (commentId: string) => ReturnType
      /** Toggle a comment mark */
      toggleComment: (commentId: string) => ReturnType
      /** Update the resolved state of a comment mark */
      setCommentResolved: (commentId: string, resolved: boolean) => ReturnType
    }
  }
}

export const CommentMark = Mark.create<CommentMarkOptions>({
  name: 'comment',

  // Allow multiple comment marks on same text (overlapping comments)
  inclusive: false,
  excludes: '',

  addOptions() {
    return {
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => ({ 'data-comment-id': attrs.commentId })
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => (attrs.resolved ? { 'data-resolved': 'true' } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = HTMLAttributes['data-resolved'] === 'true'
    const classes = [
      'xnet-comment-mark',
      resolved ? 'xnet-comment-resolved' : 'xnet-comment-active'
    ]

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-comment': '',
        class: classes.join(' ')
      }),
      0
    ]
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { commentId, resolved: false })
        },

      unsetComment:
        (commentId: string) =>
        ({ tr, state }) => {
          // Remove only the mark with this specific commentId
          const { from, to } = state.selection
          let changed = false

          state.doc.nodesBetween(from, to, (node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, mark)
                changed = true
              }
            })
          })

          return changed
        },

      toggleComment:
        (commentId: string) =>
        ({ commands, state }) => {
          const { from, to } = state.selection
          let hasComment = false

          state.doc.nodesBetween(from, to, (node) => {
            if (
              node.marks.some((m) => m.type.name === this.name && m.attrs.commentId === commentId)
            ) {
              hasComment = true
            }
          })

          return hasComment ? commands.unsetComment(commentId) : commands.setComment(commentId)
        },

      setCommentResolved:
        (commentId: string, resolved: boolean) =>
        ({ tr, state, dispatch }) => {
          // Update the resolved attribute on all marks with this commentId
          let changed = false

          state.doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                const newMark = mark.type.create({ ...mark.attrs, resolved })
                tr.removeMark(pos, pos + node.nodeSize, mark)
                tr.addMark(pos, pos + node.nodeSize, newMark)
                changed = true
              }
            })
          })

          if (changed && dispatch) {
            dispatch(tr)
          }

          return changed
        }
    }
  }
})
