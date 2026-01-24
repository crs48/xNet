import { Plugin, PluginKey } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import { Node as PMNode } from '@tiptap/pm/model'

export const DragDropPluginKey = new PluginKey('dragDrop')

export interface DragState {
  /** Position of the node being dragged */
  draggedPos: number | null
  /** The node being dragged */
  draggedNode: PMNode | null
  /** Current drop target position */
  dropPos: number | null
  /** Whether drop is before or after the target */
  dropSide: 'before' | 'after' | null
}

const INITIAL_STATE: DragState = {
  draggedPos: null,
  draggedNode: null,
  dropPos: null,
  dropSide: null
}

const DRAG_DATA_TYPE = 'application/x-xnet-block'

/**
 * Calculate where to drop the dragged block
 */
function calculateDropPosition(
  view: EditorView,
  coords: { left: number; top: number },
  draggedPos: number
): { pos: number; side: 'before' | 'after' } | null {
  const posResult = view.posAtCoords(coords)
  if (!posResult) return null

  const $pos = view.state.doc.resolve(posResult.pos)

  // Find the top-level block at this position
  let depth = $pos.depth
  while (depth > 1) {
    depth--
  }
  if (depth === 0) depth = 1

  let blockStart: number
  try {
    blockStart = $pos.before(depth)
  } catch {
    return null
  }

  // Don't allow dropping on itself
  if (blockStart === draggedPos) return null

  // Determine if dropping before or after based on mouse position
  const dom = view.nodeDOM(blockStart)
  if (!dom || !(dom instanceof HTMLElement)) return null

  const rect = dom.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const side = coords.top < midY ? 'before' : 'after'

  return { pos: blockStart, side }
}

/**
 * Create a drag preview image element
 */
function createDragImage(node: PMNode): HTMLElement {
  const el = document.createElement('div')
  el.className = 'xnet-drag-preview'
  el.style.cssText = `
    position: absolute;
    left: -9999px;
    background: white;
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 300px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
    color: #374151;
  `
  const text = node.textContent.slice(0, 50)
  el.textContent = text + (node.textContent.length > 50 ? '...' : '')
  return el
}

export function createDragDropPlugin() {
  let dragState: DragState = { ...INITIAL_STATE }

  const resetDragState = () => {
    dragState = { ...INITIAL_STATE }
  }

  return new Plugin({
    key: DragDropPluginKey,

    state: {
      init: (): DragState => ({ ...INITIAL_STATE }),
      apply: (tr, value: DragState) => {
        const meta = tr.getMeta(DragDropPluginKey)
        if (meta) {
          return { ...value, ...meta }
        }
        return value
      }
    },

    props: {
      handleDOMEvents: {
        dragstart: (view: EditorView, event: DragEvent) => {
          const target = event.target as HTMLElement
          const dragButton = target.closest('.xnet-drag-handle-button')
          if (!dragButton) return false

          const handle = dragButton.closest('.xnet-drag-handle')
          const posStr = handle?.getAttribute('data-drag-pos')
          if (!posStr) return false

          const pos = parseInt(posStr, 10)
          const $pos = view.state.doc.resolve(pos)
          const node = $pos.nodeAfter ?? $pos.parent
          if (!node) return false

          // Find the actual block start position
          let blockPos = pos
          if (!$pos.nodeAfter) {
            // pos is inside a node; find the block start
            try {
              blockPos = $pos.before($pos.depth)
            } catch {
              return false
            }
          }

          const blockNode = view.state.doc.resolve(blockPos).nodeAfter
          if (!blockNode) return false

          dragState.draggedPos = blockPos
          dragState.draggedNode = blockNode

          // Set drag data
          if (event.dataTransfer) {
            event.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify({ pos: blockPos }))
            event.dataTransfer.effectAllowed = 'move'

            // Create drag image
            const dragImage = createDragImage(blockNode)
            document.body.appendChild(dragImage)
            event.dataTransfer.setDragImage(dragImage, 0, 0)
            requestAnimationFrame(() => dragImage.remove())
          }

          // Add dragging class
          view.dom.classList.add('is-dragging')

          // Dispatch meta to update plugin state
          const tr = view.state.tr.setMeta(DragDropPluginKey, {
            draggedPos: blockPos,
            draggedNode: blockNode
          })
          view.dispatch(tr)

          return true
        },

        dragover: (view: EditorView, event: DragEvent) => {
          if (!dragState.draggedNode) return false

          event.preventDefault()
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move'
          }

          const coords = { left: event.clientX, top: event.clientY }
          const dropInfo = calculateDropPosition(view, coords, dragState.draggedPos!)

          if (dropInfo) {
            dragState.dropPos = dropInfo.pos
            dragState.dropSide = dropInfo.side

            const tr = view.state.tr.setMeta(DragDropPluginKey, {
              dropPos: dropInfo.pos,
              dropSide: dropInfo.side
            })
            view.dispatch(tr)
          }

          return true
        },

        dragleave: (view: EditorView, event: DragEvent) => {
          if (!dragState.draggedNode) return false

          const related = event.relatedTarget as HTMLElement | null
          if (!related || !view.dom.contains(related)) {
            const tr = view.state.tr.setMeta(DragDropPluginKey, {
              dropPos: null,
              dropSide: null
            })
            view.dispatch(tr)
          }
          return false
        },

        drop: (view: EditorView, event: DragEvent) => {
          if (!dragState.draggedNode || dragState.dropPos === null) {
            resetDragState()
            return false
          }

          event.preventDefault()

          const { draggedPos, draggedNode, dropPos, dropSide } = dragState

          if (draggedPos === null || !draggedNode) {
            resetDragState()
            return false
          }

          // Calculate the insert position
          let insertPos = dropPos
          if (dropSide === 'after') {
            const $dropPos = view.state.doc.resolve(dropPos)
            const nodeAfter = $dropPos.nodeAfter
            if (nodeAfter) {
              insertPos = dropPos + nodeAfter.nodeSize
            }
          }

          // Create transaction: delete then insert
          const tr = view.state.tr

          // Delete the original node first
          tr.delete(draggedPos, draggedPos + draggedNode.nodeSize)

          // Adjust insert position if it was after the deleted node
          if (insertPos > draggedPos) {
            insertPos -= draggedNode.nodeSize
          }

          // Insert at new position
          tr.insert(insertPos, draggedNode)

          // Clear drag state
          tr.setMeta(DragDropPluginKey, { ...INITIAL_STATE })

          view.dispatch(tr)
          view.dom.classList.remove('is-dragging')
          resetDragState()

          return true
        },

        dragend: (view: EditorView) => {
          view.dom.classList.remove('is-dragging')

          const tr = view.state.tr.setMeta(DragDropPluginKey, { ...INITIAL_STATE })
          view.dispatch(tr)

          resetDragState()
          return false
        }
      }
    }
  })
}
