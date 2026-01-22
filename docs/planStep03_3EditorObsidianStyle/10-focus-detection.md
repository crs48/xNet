# 10: Focus Detection

> Reliable block-level focus tracking for NodeViews

**Duration:** 0.5 days  
**Dependencies:** None (foundational for NodeViews)

## Overview

Focus detection is critical for the live preview experience. We need to reliably know when the cursor is inside a specific node so we can show/hide syntax. This document covers the `useNodeFocus` hook and related utilities.

```mermaid
flowchart TD
    subgraph "Editor State"
        SEL[Selection] --> FROM[$from position]
        SEL --> TO[$to position]
    end

    subgraph "NodeView"
        NV[NodeView] --> GP[getPos()]
        GP --> NP[Node position]
        NP --> NS[Node size]
    end

    subgraph "Focus Check"
        FROM --> CHECK{from >= pos AND to <= pos + size?}
        TO --> CHECK
        NP --> CHECK
        NS --> CHECK
        CHECK -->|Yes| FOCUSED[isFocused = true]
        CHECK -->|No| UNFOCUSED[isFocused = false]
    end
```

## Implementation

### 1. useNodeFocus Hook

````typescript
// packages/editor/src/nodeviews/hooks/useNodeFocus.ts

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Hook to track if the cursor is within a specific node.
 *
 * @param editor - The TipTap editor instance
 * @param getPos - Function that returns the node's position in the document
 * @returns boolean indicating if the cursor is inside this node
 *
 * @example
 * ```tsx
 * function HeadingView({ editor, getPos }: NodeViewProps) {
 *   const isFocused = useNodeFocus(editor, getPos)
 *
 *   return (
 *     <h1>
 *       {isFocused && <span className="syntax">## </span>}
 *       <NodeViewContent />
 *     </h1>
 *   )
 * }
 * ```
 */
export function useNodeFocus(
  editor: Editor | null,
  getPos: (() => number | undefined) | undefined
): boolean {
  const [isFocused, setIsFocused] = useState(false)
  const prevFocusedRef = useRef(false)

  const checkFocus = useCallback(() => {
    // Guard: no editor
    if (!editor || editor.isDestroyed) {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    // Guard: no getPos function
    if (!getPos) {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    // Get node position
    const pos = getPos()
    if (typeof pos !== 'number') {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    // Get node at position
    const node = editor.state.doc.nodeAt(pos)
    if (!node) {
      if (prevFocusedRef.current) {
        setIsFocused(false)
        prevFocusedRef.current = false
      }
      return
    }

    // Get selection
    const { from, to } = editor.state.selection
    const nodeEnd = pos + node.nodeSize

    // Check if selection is within this node
    // Using > and < (not >= and <=) because we want cursor INSIDE the node,
    // not at its boundaries
    const focused = from > pos && to < nodeEnd

    // Only update state if changed
    if (focused !== prevFocusedRef.current) {
      setIsFocused(focused)
      prevFocusedRef.current = focused
    }
  }, [editor, getPos])

  useEffect(() => {
    if (!editor) return

    // Initial check
    checkFocus()

    // Subscribe to selection updates
    editor.on('selectionUpdate', checkFocus)
    editor.on('focus', checkFocus)
    editor.on('blur', () => {
      setIsFocused(false)
      prevFocusedRef.current = false
    })

    return () => {
      editor.off('selectionUpdate', checkFocus)
      editor.off('focus', checkFocus)
      editor.off('blur', () => {})
    }
  }, [editor, checkFocus])

  return isFocused
}
````

### 2. useNodeFocusWithDebounce Hook

For performance-sensitive cases with rapid cursor movement:

```typescript
// packages/editor/src/nodeviews/hooks/useNodeFocusDebounced.ts

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Debounced version of useNodeFocus for performance optimization.
 * Useful when focus state triggers expensive re-renders.
 */
export function useNodeFocusDebounced(
  editor: Editor | null,
  getPos: (() => number | undefined) | undefined,
  debounceMs: number = 50
): boolean {
  const [isFocused, setIsFocused] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const checkFocus = useCallback(() => {
    if (!editor || editor.isDestroyed || !getPos) {
      setIsFocused(false)
      return
    }

    const pos = getPos()
    if (typeof pos !== 'number') {
      setIsFocused(false)
      return
    }

    const node = editor.state.doc.nodeAt(pos)
    if (!node) {
      setIsFocused(false)
      return
    }

    const { from, to } = editor.state.selection
    const nodeEnd = pos + node.nodeSize
    const focused = from > pos && to < nodeEnd

    setIsFocused(focused)
  }, [editor, getPos])

  const debouncedCheck = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(checkFocus, debounceMs)
  }, [checkFocus, debounceMs])

  useEffect(() => {
    if (!editor) return

    // Immediate initial check
    checkFocus()

    // Debounced updates
    editor.on('selectionUpdate', debouncedCheck)

    return () => {
      editor.off('selectionUpdate', debouncedCheck)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [editor, checkFocus, debouncedCheck])

  return isFocused
}
```

### 3. Focus Detection Utilities

```typescript
// packages/editor/src/utils/focus.ts

import type { EditorState } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Check if a position is within a node's boundaries.
 */
export function isPositionInNode(state: EditorState, nodePos: number, checkPos: number): boolean {
  const node = state.doc.nodeAt(nodePos)
  if (!node) return false

  const nodeEnd = nodePos + node.nodeSize
  return checkPos > nodePos && checkPos < nodeEnd
}

/**
 * Check if the current selection is entirely within a node.
 */
export function isSelectionInNode(state: EditorState, nodePos: number): boolean {
  const { from, to } = state.selection
  const node = state.doc.nodeAt(nodePos)
  if (!node) return false

  const nodeEnd = nodePos + node.nodeSize
  return from > nodePos && to < nodeEnd
}

/**
 * Get the depth of a node at a position.
 * Useful for handling nested structures.
 */
export function getNodeDepth(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  return $pos.depth
}

/**
 * Check if the cursor is at the start of a node.
 */
export function isCursorAtNodeStart(state: EditorState, nodePos: number): boolean {
  const { from } = state.selection
  const node = state.doc.nodeAt(nodePos)
  if (!node) return false

  // For block nodes, the content starts at nodePos + 1
  const contentStart = nodePos + 1
  return from === contentStart
}

/**
 * Check if the cursor is at the end of a node.
 */
export function isCursorAtNodeEnd(state: EditorState, nodePos: number): boolean {
  const { to } = state.selection
  const node = state.doc.nodeAt(nodePos)
  if (!node) return false

  // For block nodes, the content ends at nodePos + nodeSize - 1
  const contentEnd = nodePos + node.nodeSize - 1
  return to === contentEnd
}
```

### 4. Focus Extension (Alternative Approach)

An alternative approach using TipTap's Focus extension:

```typescript
// packages/editor/src/extensions/focus-tracker.ts

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const focusTrackerKey = new PluginKey('focusTracker')

interface FocusState {
  focusedNodePos: number | null
  focusedNodeType: string | null
}

export const FocusTracker = Extension.create({
  name: 'focusTracker',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: focusTrackerKey,

        state: {
          init(): FocusState {
            return { focusedNodePos: null, focusedNodeType: null }
          },

          apply(tr, prev, oldState, newState): FocusState {
            if (!tr.selectionSet) return prev

            const { $from } = newState.selection
            const node = $from.node()

            return {
              focusedNodePos: $from.before(),
              focusedNodeType: node.type.name
            }
          }
        }
      })
    ]
  }
})

// Helper to get focus state
export function getFocusState(editor: Editor): FocusState {
  return focusTrackerKey.getState(editor.state)
}
```

## Tests

```typescript
// packages/editor/src/nodeviews/hooks/useNodeFocus.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNodeFocus } from './useNodeFocus'

describe('useNodeFocus', () => {
  const createMockEditor = (selection = { from: 0, to: 0 }) => ({
    isDestroyed: false,
    state: {
      selection,
      doc: {
        nodeAt: (pos: number) => ({
          nodeSize: 10
        })
      }
    },
    on: vi.fn(),
    off: vi.fn()
  })

  describe('basic behavior', () => {
    it('should return false when editor is null', () => {
      const { result } = renderHook(() => useNodeFocus(null, () => 0))
      expect(result.current).toBe(false)
    })

    it('should return false when getPos is undefined', () => {
      const editor = createMockEditor() as any
      const { result } = renderHook(() => useNodeFocus(editor, undefined))
      expect(result.current).toBe(false)
    })

    it('should return false when getPos returns undefined', () => {
      const editor = createMockEditor() as any
      const { result } = renderHook(() => useNodeFocus(editor, () => undefined))
      expect(result.current).toBe(false)
    })
  })

  describe('focus detection', () => {
    it('should return true when cursor is inside node', () => {
      const editor = createMockEditor({ from: 5, to: 5 }) as any
      const { result } = renderHook(() => useNodeFocus(editor, () => 0))

      // Node is at pos 0 with size 10 (ends at 10)
      // Cursor at 5 is inside
      expect(result.current).toBe(true)
    })

    it('should return false when cursor is outside node', () => {
      const editor = createMockEditor({ from: 15, to: 15 }) as any
      const { result } = renderHook(() => useNodeFocus(editor, () => 0))

      // Node is at pos 0 with size 10 (ends at 10)
      // Cursor at 15 is outside
      expect(result.current).toBe(false)
    })

    it('should return false when cursor is at node boundary', () => {
      const editor = createMockEditor({ from: 0, to: 0 }) as any
      const { result } = renderHook(() => useNodeFocus(editor, () => 0))

      // Cursor at 0 is at the boundary, not inside
      expect(result.current).toBe(false)
    })

    it('should return false when selection spans beyond node', () => {
      const editor = createMockEditor({ from: 5, to: 15 }) as any
      const { result } = renderHook(() => useNodeFocus(editor, () => 0))

      // Selection from 5 to 15 goes beyond node end (10)
      expect(result.current).toBe(false)
    })
  })

  describe('event handling', () => {
    it('should subscribe to selectionUpdate', () => {
      const editor = createMockEditor() as any
      renderHook(() => useNodeFocus(editor, () => 0))

      expect(editor.on).toHaveBeenCalledWith('selectionUpdate', expect.any(Function))
    })

    it('should subscribe to focus and blur', () => {
      const editor = createMockEditor() as any
      renderHook(() => useNodeFocus(editor, () => 0))

      expect(editor.on).toHaveBeenCalledWith('focus', expect.any(Function))
      expect(editor.on).toHaveBeenCalledWith('blur', expect.any(Function))
    })

    it('should unsubscribe on unmount', () => {
      const editor = createMockEditor() as any
      const { unmount } = renderHook(() => useNodeFocus(editor, () => 0))

      unmount()

      expect(editor.off).toHaveBeenCalledWith('selectionUpdate', expect.any(Function))
    })
  })
})
```

## Performance Considerations

1. **Memoized callbacks** - Use `useCallback` to prevent unnecessary effect reruns
2. **Ref for previous state** - Avoid setState when value hasn't changed
3. **Early returns** - Exit checks as soon as possible
4. **Debouncing option** - Use debounced version for expensive NodeViews

## Edge Cases

| Scenario           | Expected Behavior               |
| ------------------ | ------------------------------- |
| Editor destroyed   | Return false, don't throw       |
| Node deleted       | Return false                    |
| Selection is range | Check if entirely within node   |
| Cursor at boundary | Return false (not inside)       |
| Nested nodes       | Each node has independent focus |
| Multiple cursors   | Handle main selection only      |

## Checklist

- [ ] Create useNodeFocus hook
- [ ] Create useNodeFocusDebounced hook
- [ ] Create focus utility functions
- [ ] Handle edge cases (null editor, destroyed, etc.)
- [ ] Optimize for performance
- [ ] Write comprehensive tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Blockquote NodeView](./09-blockquote-nodeview.md) | [Next: Slash Extension](./11-slash-extension.md)
