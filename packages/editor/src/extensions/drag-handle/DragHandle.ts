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
      handleOffset: -28,
      showDelay: 50
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
      handle.style.cssText = `
        position: absolute;
        opacity: 0;
        pointer-events: none;
        transition: opacity 150ms ease;
        z-index: 50;
      `
      return handle
    }

    const showHandle = (block: HTMLElement) => {
      if (!dragHandleElement) return

      const editorRect = editor.view.dom.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()

      const top = blockRect.top - editorRect.top + editor.view.dom.scrollTop
      const left = options.handleOffset

      dragHandleElement.style.top = `${top}px`
      dragHandleElement.style.left = `${left}px`
      dragHandleElement.style.height = `${blockRect.height}px`
      dragHandleElement.style.opacity = '1'
      dragHandleElement.style.pointerEvents = 'auto'

      // Store position for drag operations
      const pos = editor.view.posAtDOM(block, 0)
      dragHandleElement.setAttribute('data-drag-pos', String(pos))

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
