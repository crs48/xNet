import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { getCanvasObjectsMap } from './scene/doc-layout'
import { createCanvasUndoManager, CANVAS_UNDO_CAPTURE_TIMEOUT_MS } from './undo'

describe('createCanvasUndoManager', () => {
  it('undoes and redoes a local scene mutation', () => {
    const doc = new Y.Doc()
    const undoManager = createCanvasUndoManager(doc)
    const objects = getCanvasObjectsMap<{ id: string }>(doc)

    doc.transact(() => {
      objects.set('n1', { id: 'n1' })
    })
    expect(objects.has('n1')).toBe(true)
    expect(undoManager.canUndo()).toBe(true)

    undoManager.undo()
    expect(objects.has('n1')).toBe(false)

    undoManager.redo()
    expect(objects.has('n1')).toBe(true)

    undoManager.destroy()
    doc.destroy()
  })

  it('does not track changes from another origin (remote peers)', () => {
    const doc = new Y.Doc()
    const undoManager = createCanvasUndoManager(doc)
    const objects = getCanvasObjectsMap<{ id: string }>(doc)

    // A remote change carries a non-null origin and must be excluded.
    doc.transact(() => {
      objects.set('remote', { id: 'remote' })
    }, 'remote-provider')

    expect(undoManager.canUndo()).toBe(false)

    undoManager.destroy()
    doc.destroy()
  })

  it('exposes a capture timeout so drags collapse to one undo step', () => {
    expect(CANVAS_UNDO_CAPTURE_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
