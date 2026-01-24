/**
 * Throttled active format states hook for the editor.
 *
 * Tracks which formatting options (bold, italic, headings, etc.) are
 * currently active at the cursor position, with throttled updates for performance.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { throttle } from '../utils/performance'

export interface ActiveStates {
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  underline: boolean
  heading1: boolean
  heading2: boolean
  heading3: boolean
  bulletList: boolean
  orderedList: boolean
  taskList: boolean
  blockquote: boolean
  codeBlock: boolean
  link: boolean
}

const INITIAL_STATES: ActiveStates = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  underline: false,
  heading1: false,
  heading2: false,
  heading3: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  blockquote: false,
  codeBlock: false,
  link: false
}

export interface UseActiveStatesOptions {
  /** Throttle interval in milliseconds. Default: 100 */
  throttleMs?: number
}

/**
 * Hook that returns the current active formatting states from the editor.
 * Updates are throttled to avoid excessive re-renders during rapid selection changes.
 *
 * @param editor - TipTap editor instance (or null if not ready)
 * @param options - Configuration options
 * @returns Current active states object
 *
 * @example
 * ```tsx
 * function Toolbar({ editor }) {
 *   const active = useActiveStates(editor, { throttleMs: 50 })
 *   return (
 *     <button className={active.bold ? 'active' : ''}>
 *       Bold
 *     </button>
 *   )
 * }
 * ```
 */
export function useActiveStates(
  editor: Editor | null,
  options: UseActiveStatesOptions = {}
): ActiveStates {
  const { throttleMs = 100 } = options
  const [states, setStates] = useState<ActiveStates>(INITIAL_STATES)
  const throttledRef = useRef<ReturnType<typeof throttle> | null>(null)

  const computeStates = useCallback((ed: Editor): ActiveStates => {
    return {
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      strike: ed.isActive('strike'),
      code: ed.isActive('code'),
      underline: ed.isActive('underline'),
      heading1: ed.isActive('heading', { level: 1 }),
      heading2: ed.isActive('heading', { level: 2 }),
      heading3: ed.isActive('heading', { level: 3 }),
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      taskList: ed.isActive('taskList'),
      blockquote: ed.isActive('blockquote'),
      codeBlock: ed.isActive('codeBlock'),
      link: ed.isActive('link')
    }
  }, [])

  useEffect(() => {
    if (!editor) return

    const update = () => {
      setStates(computeStates(editor))
    }

    // Create throttled updater
    const throttledUpdate = throttle(update, throttleMs)
    throttledRef.current = throttledUpdate

    // Listen to selection and content changes
    editor.on('selectionUpdate', throttledUpdate)
    editor.on('transaction', throttledUpdate)

    // Initial computation
    update()

    return () => {
      editor.off('selectionUpdate', throttledUpdate)
      editor.off('transaction', throttledUpdate)
      throttledUpdate.cancel()
      throttledRef.current = null
    }
  }, [editor, throttleMs, computeStates])

  return states
}
