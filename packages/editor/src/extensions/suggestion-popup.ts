/**
 * Shared tippy-backed popup renderer for @tiptap/suggestion consumers
 * (slash commands, @mentions, #hashtags, [[wikilinks — exploration 0170).
 *
 * Every suggestion menu in the editor follows the same contract: the
 * component receives `{ items, command }`, exposes `ref.onKeyDown` for
 * arrow/enter handling, and is positioned at the caret rect. This module
 * is that contract extracted once, so each extension configures
 * `render: createSuggestionPopupRender(Menu)` instead of carrying its
 * own copy of the tippy lifecycle.
 */
import type { Editor } from '@tiptap/core'
import type { ComponentType } from 'react'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance, type Props as TippyProps } from 'tippy.js'

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

function caretPopupOptions(
  clientRect: () => DOMRect | null,
  content: Element
): Partial<TippyProps> {
  return {
    getReferenceClientRect: clientRect as () => DOMRect,
    appendTo: () => document.body,
    content,
    showOnCreate: true,
    interactive: true,
    trigger: 'manual',
    placement: 'bottom-start',
    theme: 'slash-menu',
    maxWidth: 'none',
    popperOptions: {
      modifiers: [
        { name: 'flip', enabled: true },
        { name: 'preventOverflow', enabled: true }
      ]
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
    let popup: Instance<TippyProps>[] | null = null

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

        popup = tippy('body', caretPopupOptions(props.clientRect, component.element))
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
