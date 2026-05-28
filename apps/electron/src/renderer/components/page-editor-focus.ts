export type PageEditorFocusPosition = 'start' | 'end'

export type PageEditorFocusRect = {
  top: number
  bottom: number
}

export const PAGE_EDITOR_FIRST_BLOCK_FOCUS_ZONE_PX = 96

/**
 * Resolve where an outer page-surface click should place the caret.
 *
 * Clicks near or above the editor body are treated as a first-block target.
 * Lower blank-surface clicks continue writing at the end of the document.
 */
export function resolvePageEditorFocusPosition(
  pointerY: number,
  editorRect: PageEditorFocusRect | null | undefined
): PageEditorFocusPosition {
  if (!editorRect) return 'end'

  const editorHeight = editorRect.bottom - editorRect.top
  if (!Number.isFinite(pointerY) || !Number.isFinite(editorRect.top) || editorHeight <= 0) {
    return 'end'
  }

  const focusZoneHeight = Math.min(
    PAGE_EDITOR_FIRST_BLOCK_FOCUS_ZONE_PX,
    Math.max(48, editorHeight * 0.2)
  )

  return pointerY <= editorRect.top + focusZoneHeight ? 'start' : 'end'
}
