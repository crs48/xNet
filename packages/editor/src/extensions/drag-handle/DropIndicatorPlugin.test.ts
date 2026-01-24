import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EditorState } from '@tiptap/pm/state'
import { schema } from '@tiptap/pm/schema-basic'
import { DecorationSet } from '@tiptap/pm/view'
import { createDragDropPlugin, DragDropPluginKey } from './DragDropPlugin'
import { createDropIndicatorPlugin, DropIndicatorPluginKey } from './DropIndicatorPlugin'

/**
 * Helper: create an EditorState with both plugins and given drag meta.
 * Returns the state after applying the meta transaction.
 */
function createStateWithDrag(dragMeta: Record<string, unknown>) {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('First')]),
    schema.node('paragraph', null, [schema.text('Second')])
  ])

  const plugins = [createDragDropPlugin(), createDropIndicatorPlugin()]

  let state = EditorState.create({ doc, schema, plugins })

  // Apply drag meta
  const tr = state.tr.setMeta(DragDropPluginKey, dragMeta)
  state = state.apply(tr)

  return state
}

/**
 * Get decorations from the DropIndicator plugin for a given state.
 * We directly access the plugin's spec to call the decorations function.
 */
function getDecorations(state: EditorState): DecorationSet {
  const plugin = DropIndicatorPluginKey.get(state)
  if (!plugin) return DecorationSet.empty

  // ProseMirror copies props.decorations to spec.props.decorations,
  // but may also wrap it. Access the raw spec.
  const spec = (plugin as any).spec
  const props = spec?.props || {}
  const decorationsFn = props.decorations

  if (typeof decorationsFn !== 'function') return DecorationSet.empty

  const result = decorationsFn.call(plugin, state)
  return result || DecorationSet.empty
}

describe('DropIndicatorPlugin', () => {
  it('should return empty decorations when not dragging', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('First')])])
    const plugins = [createDragDropPlugin(), createDropIndicatorPlugin()]
    const state = EditorState.create({ doc, schema, plugins })

    const decorations = getDecorations(state)
    expect(decorations).toBe(DecorationSet.empty)
  })

  it('should return empty when dropPos is null', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      draggedNode: null,
      dropPos: null,
      dropSide: null
    })

    const decorations = getDecorations(state)
    expect(decorations).toBe(DecorationSet.empty)
  })

  it('should return empty when dropSide is null', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      draggedNode: null,
      dropPos: 0,
      dropSide: null
    })

    const decorations = getDecorations(state)
    expect(decorations).toBe(DecorationSet.empty)
  })

  it('should create a decoration when drop position is set (before)', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      dropPos: 0,
      dropSide: 'before'
    })

    const decorations = getDecorations(state)
    expect(decorations).not.toBe(DecorationSet.empty)

    // Find the decorations at position 0
    const found = decorations.find(0, 0)
    expect(found.length).toBe(1)
    expect(found[0].spec.key).toContain('drop-indicator')
  })

  it('should create a decoration at correct position for before side', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      dropPos: 0,
      dropSide: 'before'
    })

    const decorations = getDecorations(state)
    const found = decorations.find(0, state.doc.content.size)
    expect(found.length).toBe(1)
    // For 'before', widget is at dropPos
    expect((found[0] as any).from).toBe(0)
  })

  it('should create a decoration at end of node for after side', () => {
    const firstNodeSize = 7 // 'First' (5) + open + close = 7

    const state = createStateWithDrag({
      draggedPos: 0,
      dropPos: 0,
      dropSide: 'after'
    })

    const decorations = getDecorations(state)
    const found = decorations.find(0, state.doc.content.size)
    expect(found.length).toBe(1)
    // For 'after', widget is at dropPos + nodeSize
    expect((found[0] as any).from).toBe(firstNodeSize)
  })

  it('should create widget with correct CSS class', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      dropPos: 0,
      dropSide: 'before'
    })

    const decorations = getDecorations(state)
    const found = decorations.find(0, state.doc.content.size)
    expect(found.length).toBe(1)

    // Call the widget's toDOM function
    const widget = found[0]
    const domFn = (widget as any).type.toDOM
    if (domFn) {
      const el = domFn()
      expect(el.className).toContain('xnet-drop-indicator')
      expect(el.className).toContain('xnet-drop-indicator--before')
      expect(el.getAttribute('data-side')).toBe('before')
    }
  })

  it('should create widget with dot accent', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      dropPos: 0,
      dropSide: 'before'
    })

    const decorations = getDecorations(state)
    const found = decorations.find(0, state.doc.content.size)
    const widget = found[0]
    const domFn = (widget as any).type.toDOM
    if (domFn) {
      const el = domFn() as HTMLElement
      const dot = el.querySelector('.xnet-drop-indicator-dot')
      expect(dot).not.toBeNull()
    }
  })

  it('should return empty for out-of-bounds dropPos', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      dropPos: 999,
      dropSide: 'before'
    })

    const decorations = getDecorations(state)
    expect(decorations).toBe(DecorationSet.empty)
  })

  it('should return empty for negative dropPos', () => {
    const state = createStateWithDrag({
      draggedPos: 0,
      dropPos: -5,
      dropSide: 'before'
    })

    const decorations = getDecorations(state)
    expect(decorations).toBe(DecorationSet.empty)
  })

  it('should handle after side with no nodeAfter', () => {
    // Drop at end of doc where there's no nodeAfter
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Only')])])
    const plugins = [createDragDropPlugin(), createDropIndicatorPlugin()]
    let state = EditorState.create({ doc, schema, plugins })

    const docSize = state.doc.content.size
    // Set dropPos at docSize (end of doc)
    const tr = state.tr.setMeta(DragDropPluginKey, {
      draggedPos: 0,
      dropPos: docSize,
      dropSide: 'after'
    })
    state = state.apply(tr)

    // Should not crash; resolving at docSize with 'after' should
    // find no nodeAfter and just use widgetPos = dropPos
    const decorations = getDecorations(state)
    // Should still produce a decoration (at docSize position)
    const found = decorations.find(0, docSize)
    expect(found.length).toBe(1)
  })
})
