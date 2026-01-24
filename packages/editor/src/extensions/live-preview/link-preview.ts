import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export const linkPreviewPluginKey = new PluginKey('linkPreview')

/**
 * Plugin that shows [text](url) syntax when cursor is inside a link.
 */
export function createLinkPreviewPlugin() {
  return new Plugin({
    key: linkPreviewPluginKey,

    state: {
      init(_, state) {
        return computeLinkDecorations(state)
      },

      apply(tr, oldDecorations, _oldState, newState) {
        if (!tr.selectionSet && !tr.docChanged) {
          return oldDecorations
        }
        return computeLinkDecorations(newState)
      }
    },

    props: {
      decorations(state) {
        return this.getState(state)
      }
    }
  })
}

function computeLinkDecorations(state: import('@tiptap/pm/state').EditorState): DecorationSet {
  const { doc, selection } = state
  const { $from, empty } = selection

  if (!empty) return DecorationSet.empty

  // Check if cursor is in a link
  const linkMark = $from.marks().find((m) => m.type.name === 'link')
  if (!linkMark) return DecorationSet.empty

  const href = (linkMark.attrs as { href?: string }).href || ''

  // Find the link boundaries
  const range = findLinkRange(doc, $from.pos)
  if (!range) return DecorationSet.empty

  const decorations: Decoration[] = []

  // Add opening bracket [
  decorations.push(
    Decoration.widget(range.from, () => createLinkSyntax('[', 'bracket-open'), {
      side: -1,
      key: 'link-open'
    })
  )

  // Add ]( after text
  decorations.push(
    Decoration.widget(range.to, () => createLinkSyntax('](', 'bracket-close'), {
      side: 0,
      key: 'link-middle'
    })
  )

  // Add URL
  decorations.push(
    Decoration.widget(range.to, () => createLinkUrl(href), {
      side: 1,
      key: 'link-url'
    })
  )

  // Add closing )
  decorations.push(
    Decoration.widget(range.to, () => createLinkSyntax(')', 'paren-close'), {
      side: 2,
      key: 'link-close'
    })
  )

  return DecorationSet.create(doc, decorations)
}

function findLinkRange(doc: ProseMirrorNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(pos)
  const start = $pos.start()
  const end = $pos.end()

  let from = -1
  let to = -1

  doc.nodesBetween(start, end, (node, nodePos) => {
    if (!node.isText) return true

    const hasLink = node.marks.some((m) => m.type.name === 'link')
    const nodeEnd = nodePos + node.nodeSize
    const containsPos = pos >= nodePos && pos <= nodeEnd

    if (hasLink && containsPos) {
      if (from === -1) from = nodePos
      to = nodeEnd
    } else if (hasLink && from !== -1) {
      // Extend if contiguous
      to = nodeEnd
    }

    return true
  })

  return from !== -1 ? { from, to } : null
}

function createLinkSyntax(text: string, type: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'md-syntax md-syntax-link'
  span.setAttribute('data-type', type)
  span.setAttribute('aria-hidden', 'true')
  span.textContent = text
  return span
}

function createLinkUrl(url: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'md-syntax md-syntax-link md-syntax-url'
  span.setAttribute('aria-hidden', 'true')

  // Truncate long URLs
  const displayUrl = url.length > 40 ? url.slice(0, 37) + '...' : url
  span.textContent = displayUrl
  span.title = url

  return span
}
