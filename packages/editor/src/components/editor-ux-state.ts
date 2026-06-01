import type { Selection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEffect, useMemo, useState } from 'react'

export type ToolbarMode = 'auto' | 'desktop' | 'mobile'
export type ToolbarSurface = 'page' | 'canvas-inline' | 'canvas-preview' | 'read'
export type ToolbarPresentation = 'hidden' | 'desktop-floating' | 'mobile-fixed' | 'canvas-compact'
export type SelectionShape = 'collapsed' | 'range' | 'node'
export type EditorContentMode = 'live' | 'source' | 'read'

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

export interface ToolbarPolicyInput {
  surface?: ToolbarSurface
  isMobile: boolean
  isFocused: boolean
  selectionShape: SelectionShape
  inCodeBlock: boolean
  inTaskItem?: boolean
  readOnly?: boolean
}

export interface ToolbarPolicy {
  presentation: ToolbarPresentation
  isCompact: boolean
}

export interface EditorModePolicyInput {
  requestedMode?: EditorContentMode
  surface?: ToolbarSurface
  readOnly?: boolean
}

export interface EditorModePolicy {
  contentMode: EditorContentMode
  isEditable: boolean
  rendersRichEditor: boolean
  allowsToolbar: boolean
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
  return (
    resolveToolbarPolicy({
      surface: 'page',
      isMobile: false,
      isFocused: true,
      ...opts
    }).presentation === 'desktop-floating'
  )
}

function hasCommandSelection(input: Pick<ToolbarPolicyInput, 'selectionShape' | 'inTaskItem'>) {
  return (
    input.selectionShape === 'range' || (input.selectionShape === 'collapsed' && !!input.inTaskItem)
  )
}

export function resolveToolbarPolicy(input: ToolbarPolicyInput): ToolbarPolicy {
  const surface = input.surface ?? 'page'

  if (input.readOnly || surface === 'read' || surface === 'canvas-preview') {
    return { presentation: 'hidden', isCompact: false }
  }

  if (input.inCodeBlock) {
    return { presentation: 'hidden', isCompact: false }
  }

  if (!input.isFocused) {
    return { presentation: 'hidden', isCompact: surface === 'canvas-inline' }
  }

  if (surface === 'canvas-inline') {
    return hasCommandSelection(input)
      ? { presentation: 'canvas-compact', isCompact: true }
      : { presentation: 'hidden', isCompact: true }
  }

  if (input.isMobile) {
    return input.isFocused
      ? { presentation: 'mobile-fixed', isCompact: false }
      : { presentation: 'hidden', isCompact: false }
  }

  return hasCommandSelection(input)
    ? { presentation: 'desktop-floating', isCompact: false }
    : { presentation: 'hidden', isCompact: false }
}

export function resolveEditorModePolicy(input: EditorModePolicyInput): EditorModePolicy {
  const surface = input.surface ?? 'page'
  const requestedMode = input.requestedMode ?? 'live'
  const readMode = input.readOnly || surface === 'read' || surface === 'canvas-preview'
  const contentMode: EditorContentMode = readMode ? 'read' : requestedMode

  if (contentMode === 'source') {
    return {
      contentMode,
      isEditable: false,
      rendersRichEditor: false,
      allowsToolbar: false
    }
  }

  if (contentMode === 'read') {
    return {
      contentMode,
      isEditable: false,
      rendersRichEditor: true,
      allowsToolbar: false
    }
  }

  return {
    contentMode,
    isEditable: true,
    rendersRichEditor: true,
    allowsToolbar: true
  }
}
