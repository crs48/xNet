/**
 * useEditor hook - React binding for @xnet/editor
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { createEditor, type Editor, type EditorConfig, type Selection } from '@xnet/editor'
import type * as Y from 'yjs'

/**
 * Options for useEditor hook
 */
export interface UseEditorOptions {
  /** The Yjs document to bind to */
  ydoc: Y.Doc | null
  /** The name of the Y.Text field to use (default: 'content') */
  field?: string
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
}

/**
 * Result from useEditor hook
 */
export interface UseEditorResult {
  /** Current content */
  content: string
  /** Current selection */
  selection: Selection | null
  /** Whether the editor is focused */
  focused: boolean
  /** The editor instance */
  editor: Editor | null
  /** Set content */
  setContent: (content: string) => void
  /** Handle input change from a textarea/input */
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void
  /** Handle selection change */
  handleSelect: (e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => void
  /** Handle focus */
  handleFocus: () => void
  /** Handle blur */
  handleBlur: () => void
}

/**
 * React hook for using @xnet/editor
 */
export function useEditor(options: UseEditorOptions): UseEditorResult {
  const { ydoc, field = 'content', placeholder = '', readOnly = false } = options

  const editorRef = useRef<Editor | null>(null)
  const [content, setContentState] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [focused, setFocused] = useState(false)

  // Create/destroy editor when ydoc changes
  useEffect(() => {
    if (!ydoc) {
      editorRef.current = null
      setContentState('')
      return
    }

    const editor = createEditor({
      ydoc,
      field,
      placeholder,
      readOnly,
      onChange: (newContent) => {
        setContentState(newContent)
      },
      onSelectionChange: (sel) => {
        setSelection(sel)
      }
    })

    editorRef.current = editor
    setContentState(editor.getContent())

    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [ydoc, field, placeholder, readOnly])

  // Update read-only state
  useEffect(() => {
    editorRef.current?.setReadOnly(readOnly)
  }, [readOnly])

  const setContent = useCallback((newContent: string) => {
    editorRef.current?.setContent(newContent)
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const newValue = e.target.value
    const oldValue = editorRef.current?.getContent() ?? ''

    if (editorRef.current && newValue !== oldValue) {
      editorRef.current.applyDelta(oldValue, newValue, e.target.selectionStart ?? 0)
    }
  }, [])

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const target = e.target as HTMLTextAreaElement | HTMLInputElement
    const sel: Selection = {
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
      direction: (target.selectionDirection as Selection['direction']) ?? 'none'
    }
    editorRef.current?.setSelection(sel)
  }, [])

  const handleFocus = useCallback(() => {
    setFocused(true)
    editorRef.current?.setFocused(true)
  }, [])

  const handleBlur = useCallback(() => {
    setFocused(false)
    editorRef.current?.setFocused(false)
  }, [])

  return {
    content,
    selection,
    focused,
    editor: editorRef.current,
    setContent,
    handleChange,
    handleSelect,
    handleFocus,
    handleBlur
  }
}
