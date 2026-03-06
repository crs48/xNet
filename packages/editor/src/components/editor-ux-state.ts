import type { Selection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEffect, useMemo, useState } from 'react'

export type ToolbarMode = 'auto' | 'desktop' | 'mobile'
export type SelectionShape = 'collapsed' | 'range' | 'node'

export interface KeyboardThresholds {
  openRatio: number
  minHeight: number
  minOffsetTop: number
}

export interface KeyboardViewportSnapshot {
  layoutHeight: number
  viewportHeight: number
  viewportOffsetTop: number
}

export interface KeyboardState {
  visible: boolean
  height: number
  offsetTop: number
}

export interface EditorUxState {
  isMobile: boolean
  isFocused: boolean
  selectionShape: SelectionShape
  keyboard: KeyboardState
}

export const DEFAULT_KEYBOARD_THRESHOLDS: KeyboardThresholds = {
  openRatio: 0.8,
  minHeight: 120,
  minOffsetTop: 32
}

export function deriveSelectionShape(selection: Selection): SelectionShape {
  if (selection instanceof NodeSelection) {
    return 'node'
  }
  return selection.empty ? 'collapsed' : 'range'
}

export function deriveKeyboardState(
  snapshot: KeyboardViewportSnapshot,
  thresholds: KeyboardThresholds = DEFAULT_KEYBOARD_THRESHOLDS
): KeyboardState {
  const { layoutHeight, viewportHeight, viewportOffsetTop } = snapshot
  const keyboardHeight = Math.max(0, layoutHeight - viewportHeight - viewportOffsetTop)
  const ratioThreshold = layoutHeight * (1 - thresholds.openRatio)
  const visible =
    keyboardHeight >= Math.max(thresholds.minHeight, ratioThreshold) ||
    viewportOffsetTop >= thresholds.minOffsetTop

  return {
    visible,
    height: visible ? keyboardHeight : 0,
    offsetTop: viewportOffsetTop
  }
}

export function resolveIsMobile(mode: ToolbarMode): boolean {
  if (mode === 'mobile') return true
  if (mode === 'desktop') return false
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isNarrow = window.innerWidth < 768
  return hasTouch || isNarrow
}

function normalizeThresholds(
  thresholds: Partial<KeyboardThresholds> | undefined
): KeyboardThresholds {
  return {
    openRatio: thresholds?.openRatio ?? DEFAULT_KEYBOARD_THRESHOLDS.openRatio,
    minHeight: thresholds?.minHeight ?? DEFAULT_KEYBOARD_THRESHOLDS.minHeight,
    minOffsetTop: thresholds?.minOffsetTop ?? DEFAULT_KEYBOARD_THRESHOLDS.minOffsetTop
  }
}

export function useEditorUxState(
  editor: Editor | null,
  mode: ToolbarMode,
  thresholds?: Partial<KeyboardThresholds>
): EditorUxState {
  const mergedThresholds = useMemo(() => normalizeThresholds(thresholds), [thresholds])
  const [isMobile, setIsMobile] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [selectionShape, setSelectionShape] = useState<SelectionShape>('collapsed')
  const [keyboard, setKeyboard] = useState<KeyboardState>({
    visible: false,
    height: 0,
    offsetTop: 0
  })

  useEffect(() => {
    const refresh = () => setIsMobile(resolveIsMobile(mode))
    refresh()
    window.addEventListener('resize', refresh)
    return () => window.removeEventListener('resize', refresh)
  }, [mode])

  useEffect(() => {
    if (!editor) {
      setIsFocused(false)
      setSelectionShape('collapsed')
      return
    }

    const handleSelection = () => setSelectionShape(deriveSelectionShape(editor.state.selection))
    const handleFocus = () => {
      setIsFocused(true)
      handleSelection()
    }
    const handleBlur = () => setIsFocused(false)

    setIsFocused(editor.isFocused)
    handleSelection()

    editor.on('selectionUpdate', handleSelection)
    editor.on('transaction', handleSelection)
    editor.on('focus', handleFocus)
    editor.on('blur', handleBlur)

    return () => {
      editor.off('selectionUpdate', handleSelection)
      editor.off('transaction', handleSelection)
      editor.off('focus', handleFocus)
      editor.off('blur', handleBlur)
    }
  }, [editor])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      setKeyboard(
        deriveKeyboardState(
          {
            layoutHeight: window.innerHeight,
            viewportHeight: viewport.height,
            viewportOffsetTop: viewport.offsetTop
          },
          mergedThresholds
        )
      )
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    viewport.addEventListener('scrollend', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      viewport.removeEventListener('scrollend', update)
    }
  }, [mergedThresholds])

  return {
    isMobile,
    isFocused,
    selectionShape,
    keyboard
  }
}

export function shouldShowDesktopToolbar(opts: {
  selectionShape: SelectionShape
  inCodeBlock: boolean
  inTaskItem?: boolean
}): boolean {
  if (opts.inCodeBlock) return false
  return (
    opts.selectionShape === 'range' || (opts.selectionShape === 'collapsed' && !!opts.inTaskItem)
  )
}
