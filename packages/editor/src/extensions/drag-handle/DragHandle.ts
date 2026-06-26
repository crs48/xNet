import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface DragHandleOptions {
  /** CSS selector for elements that should show drag handles */
  draggableSelector: string
  /** Offset from the left edge of the block (px) */
  handleOffset: number
  /** Delay before showing handle on hover (ms) */
  showDelay: number
}

export const DragHandlePluginKey = new PluginKey('dragHandle')

export const DragHandle = Extension.create<DragHandleOptions>({
  name: 'dragHandle',

  addOptions() {
    return {
      draggableSelector: 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr',
      handleOffset: 0,
      showDelay: 0
    }
  },

  addProseMirrorPlugins() {
    const { editor, options } = this
    let dragHandleElement: HTMLElement | null = null
    let currentBlock: HTMLElement | null = null
    let showTimeout: ReturnType<typeof setTimeout> | null = null

    const createDragHandle = (): HTMLElement => {
      const handle = document.createElement('div')
      handle.className = 'xnet-drag-handle'
      handle.innerHTML = `
        <button
          type="button"
          class="xnet-drag-handle-button"
          aria-label="Drag to reorder or click for options"
          draggable="true"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <circle cx="4" cy="3" r="1.5" />
            <circle cx="10" cy="3" r="1.5" />
            <circle cx="4" cy="7" r="1.5" />
            <circle cx="10" cy="7" r="1.5" />
            <circle cx="4" cy="11" r="1.5" />
            <circle cx="10" cy="11" r="1.5" />
          </svg>
        </button>
      `
      // Extended padding-right creates an invisible hover zone bridging
      // the gap between the handle and the content
      handle.style.cssText = `
        position: absolute;
        opacity: 0;
        pointer-events: none;
        transition: opacity 150ms ease;
        z-index: 50;
        padding-right: 8px;
      `
      return handle
    }

    const showHandle = (block: HTMLElement) => {
      if (!dragHandleElement) return

      const parentEl = editor.view.dom.parentElement
      if (!parentEl) return

      const editorDom = editor.view.dom as HTMLElement
      const parentRect = parentEl.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()
      const blockStyle = getComputedStyle(block)

      // Vertical: give the handle a box the height of the block's FIRST line
      // and let the button centre within it (CSS align-items: center), so it
      // tracks line-height at any block size instead of a fixed offset. A Range
      // over the content finds the real first line box — this stays correct for
      // list items whose inner paragraph carries its own top margin (a plain
      // block-box top would sit above the text by that margin).
      let firstLineTop = blockRect.top
      let firstLineHeight = parseFloat(blockStyle.lineHeight)
      if (Number.isNaN(firstLineHeight)) {
        firstLineHeight = (parseFloat(blockStyle.fontSize) || 16) * 1.2
      }
      try {
        const range = block.ownerDocument.createRange()
        range.selectNodeContents(block)
        const rects = range.getClientRects()
        if (rects.length > 0) {
          firstLineTop = rects[0].top
          firstLineHeight = rects[0].height
        }
      } catch {
        // No selectable content (e.g. an <hr>) — keep the block-box fallback.
      }
      const top = firstLineTop - parentRect.top + parentEl.scrollTop

      // Horizontal: anchor to the editor's content-left (the constant prose
      // gutter), NOT the matched block's left edge. Indented list content used
      // to drag the handle right onto the bullets/checkboxes; pinning it to the
      // gutter keeps it left of every block type.
      const editorStyle = getComputedStyle(editorDom)
      const contentLeft =
        editorDom.getBoundingClientRect().left + (parseFloat(editorStyle.paddingLeft) || 0)
      const handleWidth = 24 // handle width + small gap to the content
      const left = contentLeft - parentRect.left - handleWidth

      // Store position for drag operations - get position BEFORE the block node
      let pos: number
      try {
        pos = editor.view.posAtDOM(block, 0)
      } catch {
        // DOM node not in document (can happen during updates)
        return
      }

      // posAtDOM returns -1 if the node is not in the document
      if (pos < 0) return

      let blockPos = pos
      try {
        const $pos = editor.state.doc.resolve(pos)
        // Position before the TOP-LEVEL block (depth 1), so a list drags as a
        // whole rather than the inner paragraph of the hovered item.
        blockPos = $pos.depth >= 1 ? $pos.before(1) : pos
      } catch {
        // Fallback to resolved position
        blockPos = pos
      }

      dragHandleElement.style.top = `${top}px`
      dragHandleElement.style.left = `${left}px`
      dragHandleElement.style.height = `${firstLineHeight}px`
      dragHandleElement.style.opacity = '1'
      dragHandleElement.style.pointerEvents = 'auto'
      dragHandleElement.setAttribute('data-drag-pos', String(blockPos))

      currentBlock = block
    }

    const hideHandle = () => {
      if (showTimeout) {
        clearTimeout(showTimeout)
        showTimeout = null
      }

      if (dragHandleElement) {
        dragHandleElement.style.opacity = '0'
        dragHandleElement.style.pointerEvents = 'none'
      }
      currentBlock = null
    }

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // Don't hide if hovering the drag handle itself
      if (target.closest('.xnet-drag-handle')) return

      const block = target.closest(options.draggableSelector) as HTMLElement | null

      if (!block || !editor.view.dom.contains(block)) {
        hideHandle()
        return
      }

      if (block === currentBlock) return

      if (showTimeout) {
        clearTimeout(showTimeout)
      }

      showTimeout = setTimeout(() => {
        showHandle(block)
      }, options.showDelay)
    }

    const handleMouseLeave = (event: MouseEvent) => {
      const related = event.relatedTarget as HTMLElement | null
      // Don't hide if moving to the drag handle
      if (related?.closest('.xnet-drag-handle')) return
      hideHandle()
    }

    return [
      new Plugin({
        key: DragHandlePluginKey,
        view: (editorView) => {
          dragHandleElement = createDragHandle()
          const parentEl = editorView.dom.parentElement
          if (parentEl) {
            parentEl.style.position = 'relative'
            parentEl.appendChild(dragHandleElement)
          }

          editorView.dom.addEventListener('mousemove', handleMouseMove)
          editorView.dom.addEventListener('mouseleave', handleMouseLeave)

          // Also listen on the handle itself for mouse leave
          dragHandleElement.addEventListener('mouseleave', (e: MouseEvent) => {
            const related = e.relatedTarget as HTMLElement | null
            if (!related || !editorView.dom.contains(related)) {
              hideHandle()
            }
          })

          return {
            update: () => {
              // Recalculate position if content changes while handle is visible
              if (currentBlock && dragHandleElement?.style.opacity === '1') {
                if (editor.view.dom.contains(currentBlock)) {
                  showHandle(currentBlock)
                } else {
                  hideHandle()
                }
              }
            },
            destroy: () => {
              editorView.dom.removeEventListener('mousemove', handleMouseMove)
              editorView.dom.removeEventListener('mouseleave', handleMouseLeave)
              dragHandleElement?.remove()
              if (showTimeout) clearTimeout(showTimeout)
            }
          }
        }
      })
    ]
  }
})
