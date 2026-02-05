/**
 * EmbedLinkPlugin - Shows "Embed" button on hover for embeddable links.
 *
 * When hovering over a link that can be embedded (YouTube, etc.),
 * shows a tooltip with an "Embed" button to convert it.
 */
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { parseEmbedUrl } from './providers'

export const EmbedLinkPluginKey = new PluginKey('embedLink')

export interface EmbedLinkPluginOptions {
  editor: Editor
}

export function createEmbedLinkPlugin(options: EmbedLinkPluginOptions) {
  let tooltip: HTMLElement | null = null
  let currentLinkPos: { from: number; to: number } | null = null
  let hideTimeout: ReturnType<typeof setTimeout> | null = null

  const showTooltip = (
    view: EditorView,
    url: string,
    rect: DOMRect,
    linkRange: { from: number; to: number }
  ) => {
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }

    if (!tooltip) {
      tooltip = document.createElement('div')
      tooltip.className = 'xnet-embed-link-tooltip'
      tooltip.innerHTML = `
        <button type="button" class="xnet-embed-link-button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          <span>Embed</span>
        </button>
      `
      // Detect dark mode
      const isDark = document.documentElement.classList.contains('dark')

      tooltip.style.cssText = `
        position: fixed;
        z-index: 100;
        background: ${isDark ? '#1f2937' : 'white'};
        border: 1px solid ${isDark ? '#374151' : '#e5e7eb'};
        border-radius: 6px;
        padding: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,${isDark ? '0.4' : '0.15'});
        pointer-events: auto;
      `

      const button = tooltip.querySelector('button')!
      button.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        font-size: 12px;
        color: ${isDark ? '#d1d5db' : '#374151'};
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      `
      button.addEventListener('mouseenter', () => {
        button.style.background = isDark ? '#374151' : '#f3f4f6'
      })
      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent'
      })
      button.addEventListener('click', () => {
        if (!currentLinkPos) return

        // Replace link with embed
        options.editor.chain().focus().deleteRange(currentLinkPos).setEmbed(url).run()

        hideTooltip()
      })

      // Keep tooltip visible when hovering it
      tooltip.addEventListener('mouseenter', () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout)
          hideTimeout = null
        }
      })
      tooltip.addEventListener('mouseleave', () => {
        hideTooltip()
      })

      document.body.appendChild(tooltip)
    }

    currentLinkPos = linkRange

    // Position below the link
    tooltip.style.left = `${rect.left}px`
    tooltip.style.top = `${rect.bottom + 4}px`
    tooltip.style.display = 'block'
  }

  const hideTooltip = () => {
    if (tooltip) {
      tooltip.style.display = 'none'
    }
    currentLinkPos = null
  }

  const scheduleHide = () => {
    if (hideTimeout) clearTimeout(hideTimeout)
    hideTimeout = setTimeout(hideTooltip, 150)
  }

  return new Plugin({
    key: EmbedLinkPluginKey,

    view() {
      return {
        destroy() {
          if (tooltip) {
            tooltip.remove()
            tooltip = null
          }
          if (hideTimeout) {
            clearTimeout(hideTimeout)
          }
        }
      }
    },

    props: {
      handleDOMEvents: {
        mouseover(view, event) {
          const target = event.target as HTMLElement
          const link = target.closest('a')

          if (!link) {
            scheduleHide()
            return false
          }

          const href = link.getAttribute('href')
          if (!href) {
            scheduleHide()
            return false
          }

          // Check if this URL can be embedded
          const parsed = parseEmbedUrl(href)
          if (!parsed) {
            scheduleHide()
            return false
          }

          // Find the link position in the document
          const pos = view.posAtDOM(link, 0)
          if (pos < 0) {
            scheduleHide()
            return false
          }

          // Find link boundaries
          const $pos = view.state.doc.resolve(pos)
          const linkMark = $pos.marks().find((m) => m.type.name === 'link')
          if (!linkMark) {
            scheduleHide()
            return false
          }

          // Find the full extent of the link mark
          let from = pos
          let to = pos

          // Walk backwards to find start
          view.state.doc.nodesBetween(Math.max(0, pos - 100), pos, (node, nodePos) => {
            if (
              node.isText &&
              node.marks.some((m) => m.type.name === 'link' && m.attrs.href === href)
            ) {
              from = Math.min(from, nodePos)
            }
          })

          // Walk forwards to find end
          view.state.doc.nodesBetween(
            pos,
            Math.min(view.state.doc.content.size, pos + 100),
            (node, nodePos) => {
              if (
                node.isText &&
                node.marks.some((m) => m.type.name === 'link' && m.attrs.href === href)
              ) {
                to = Math.max(to, nodePos + node.nodeSize)
              }
            }
          )

          const rect = link.getBoundingClientRect()
          showTooltip(view, href, rect, { from, to })

          return false
        },

        mouseout(view, event) {
          const related = event.relatedTarget as HTMLElement | null
          if (related?.closest('.xnet-embed-link-tooltip')) {
            return false
          }
          scheduleHide()
          return false
        }
      }
    }
  })
}
