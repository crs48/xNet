import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { DragDropPluginKey, type DragState } from './DragDropPlugin'

export const DropIndicatorPluginKey = new PluginKey('dropIndicator')

/**
 * Creates ProseMirror decorations to show a drop indicator line during drag operations.
 * Uses the drag state from DragDropPlugin to determine position and side.
 */
export function createDropIndicatorPlugin() {
  return new Plugin({
    key: DropIndicatorPluginKey,

    props: {
      decorations(state) {
        const dragState = DragDropPluginKey.getState(state) as DragState | undefined

        if (dragState?.dropPos == null || !dragState.dropSide) {
          return DecorationSet.empty
        }

        const { dropPos, dropSide } = dragState

        // Validate position is within document bounds before resolving
        if (dropPos < 0 || dropPos > state.doc.content.size) {
          return DecorationSet.empty
        }

        // Calculate the widget insertion point
        let widgetPos = dropPos
        if (dropSide === 'after') {
          try {
            const $pos = state.doc.resolve(dropPos)
            const nodeAfter = $pos.nodeAfter
            if (nodeAfter) {
              widgetPos = dropPos + nodeAfter.nodeSize
            }
          } catch {
            return DecorationSet.empty
          }
        }

        // Clamp to document bounds
        if (widgetPos < 0 || widgetPos > state.doc.content.size) {
          return DecorationSet.empty
        }

        const decoration = Decoration.widget(
          widgetPos,
          () => {
            const indicator = document.createElement('div')
            indicator.className = `xnet-drop-indicator xnet-drop-indicator--${dropSide}`
            indicator.setAttribute('data-side', dropSide)

            // Circle accent on the left
            const dot = document.createElement('div')
            dot.className = 'xnet-drop-indicator-dot'
            indicator.appendChild(dot)

            return indicator
          },
          {
            side: dropSide === 'before' ? -1 : 1,
            key: `drop-indicator-${widgetPos}-${dropSide}`
          }
        )

        return DecorationSet.create(state.doc, [decoration])
      }
    }
  })
}
