/**
 * Canvas keyboard shortcut helpers.
 */

export interface UndoRedoHandlers {
  undo: () => void
  redo: () => void
}

export function isTextInputLikeElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable
  )
}

export function handleUndoRedoShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'preventDefault'>,
  container: HTMLElement,
  activeElement: Element | null,
  handlers: UndoRedoHandlers
): boolean {
  if (!container.contains(activeElement)) return false
  if (isTextInputLikeElement(activeElement)) return false

  const key = event.key.toLowerCase()

  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      handlers.redo()
    } else {
      handlers.undo()
    }
    return true
  }

  if (!event.metaKey && event.ctrlKey && !event.shiftKey && key === 'y') {
    event.preventDefault()
    handlers.redo()
    return true
  }

  return false
}
