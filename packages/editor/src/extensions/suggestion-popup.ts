/**
 * Shared Floating UI-backed popup renderer for @tiptap/suggestion consumers
 * (slash commands, @mentions, #hashtags, [[wikilinks — exploration 0170).
 *
 * Every suggestion menu in the editor follows the same contract: the
 * component receives `{ items, command }`, exposes `ref.onKeyDown` for
 * arrow/enter handling, and is positioned at the caret rect. This module
 * is that contract extracted once, so each extension configures
 * `render: createSuggestionPopupRender(Menu)` instead of carrying its
 * own copy of the popup lifecycle.
 *
 * Positioning uses @floating-ui/dom (the stack Tiptap v3 itself uses),
 * anchored to a virtual element around the caret client rect (0297).
 */
import type { Editor } from '@tiptap/core'
import type { ComponentType } from 'react'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { ReactRenderer } from '@tiptap/react'

/** Keyboard contract every suggestion menu exposes via ref. */
export interface SuggestionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** Props every suggestion menu component receives. */
export interface SuggestionMenuProps<TItem> {
  items: TItem[]
  command: (item: TItem) => void
}

/** The subset of @tiptap/suggestion render props the popup consumes. */
export interface SuggestionPopupRenderProps<TItem> {
  editor: Editor
  items: TItem[]
  command: (item: TItem) => void
  clientRect?: (() => DOMRect | null) | null
}

export interface SuggestionPopupHandlers<TItem> {
  onStart: (props: SuggestionPopupRenderProps<TItem>) => void
  onUpdate: (props: SuggestionPopupRenderProps<TItem>) => void
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
  onExit: () => void
}

interface PopupComponentLike {
  updateProps(props: Record<string, unknown>): void
}

interface PopupInstanceLike {
  setProps(props: Record<string, unknown>): void
}

/** Caret-anchored popup handle returned by createCaretPopup. */
export interface CaretPopup extends PopupInstanceLike {
  hide(): void
  destroy(): void
}

/** Suggestion-popup update step shared by onUpdate (exported for tests). */
export function updateSuggestionPopup<TItem>(
  component: PopupComponentLike | null,
  popup: PopupInstanceLike[] | null,
  props: {
    items: TItem[]
    command: (item: TItem) => void
    clientRect?: (() => DOMRect | null) | null
  }
): void {
  if (!component) return
  component.updateProps({
    items: props.items,
    command: (item: TItem) => props.command(item)
  })
  if (props.clientRect && popup?.[0]) {
    popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
  }
}

/**
 * Mount `content` in a body-level container positioned at the caret rect,
 * kept in place across scroll/resize by Floating UI's autoUpdate.
 * Exported for tests.
 */
export function createCaretPopup(clientRect: () => DOMRect | null, content: Element): CaretPopup {
  const container = document.createElement('div')
  container.className = 'xnet-suggestion-popup'
  container.appendChild(content)
  document.body.appendChild(container)

  let getRect = clientRect
  let destroyed = false
  const virtualElement = {
    getBoundingClientRect: () => getRect() ?? new DOMRect(0, 0, 0, 0)
  }

  const reposition = () => {
    if (destroyed) return
    void computePosition(virtualElement, container, {
      // Fixed strategy: caret rects are viewport coordinates, so the popup
      // needs no page-scroll math and stays correct inside scroll islands.
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })]
    }).then(({ x, y }) => {
      if (destroyed) return
      container.style.left = `${x}px`
      container.style.top = `${y}px`
    })
  }

  const stopAutoUpdate = autoUpdate(virtualElement, container, reposition)

  return {
    setProps(props: Record<string, unknown>) {
      const next = props.getReferenceClientRect
      if (typeof next === 'function') {
        getRect = next as () => DOMRect | null
      }
      reposition()
    },
    hide() {
      container.style.display = 'none'
    },
    destroy() {
      destroyed = true
      stopAutoUpdate()
      container.remove()
    }
  }
}

/**
 * Build a @tiptap/suggestion `render` factory around a menu component.
 */
export function createSuggestionPopupRender<TItem>(
  MenuComponent: ComponentType<SuggestionMenuProps<TItem>>
): () => SuggestionPopupHandlers<TItem> {
  return () => {
    let component: ReactRenderer<SuggestionMenuRef> | null = null
    let popup: CaretPopup[] | null = null

    return {
      onStart: (props) => {
        component = new ReactRenderer<SuggestionMenuRef>(MenuComponent as ComponentType<object>, {
          props: {
            items: props.items,
            command: (item: TItem) => props.command(item)
          },
          editor: props.editor
        })

        if (!props.clientRect) return

        popup = [createCaretPopup(props.clientRect, component.element)]
      },

      onUpdate: (props) => {
        updateSuggestionPopup(component, popup, props)
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          popup?.[0]?.hide()
          return true
        }
        return component?.ref?.onKeyDown(props.event) ?? false
      },

      onExit: () => {
        popup?.[0]?.destroy()
        component?.destroy()
        popup = null
        component = null
      }
    }
  }
}
