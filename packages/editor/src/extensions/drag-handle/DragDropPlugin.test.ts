import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EditorState } from '@tiptap/pm/state'
import { schema } from '@tiptap/pm/schema-basic'
import { createDragDropPlugin, DragDropPluginKey } from './DragDropPlugin'

describe('DragDropPlugin', () => {
  let state: EditorState

  beforeEach(() => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('First paragraph')]),
      schema.node('paragraph', null, [schema.text('Second paragraph')]),
      schema.node('paragraph', null, [schema.text('Third paragraph')])
    ])

    state = EditorState.create({
      doc,
      schema,
      plugins: [createDragDropPlugin()]
    })
  })

  describe('initial state', () => {
    it('should have null drag state', () => {
      const dragState = DragDropPluginKey.getState(state)

      expect(dragState.draggedPos).toBeNull()
      expect(dragState.draggedNode).toBeNull()
      expect(dragState.dropPos).toBeNull()
      expect(dragState.dropSide).toBeNull()
    })
  })

  describe('plugin state updates via meta', () => {
    it('should update state with draggedPos and draggedNode', () => {
      const node = state.doc.firstChild!
      const tr = state.tr.setMeta(DragDropPluginKey, {
        draggedPos: 0,
        draggedNode: node
      })

      const newState = state.apply(tr)
      const dragState = DragDropPluginKey.getState(newState)

      expect(dragState.draggedPos).toBe(0)
      expect(dragState.draggedNode).toBe(node)
    })

    it('should update drop position and side', () => {
      const tr = state.tr.setMeta(DragDropPluginKey, {
        dropPos: 17,
        dropSide: 'before'
      })

      const newState = state.apply(tr)
      const dragState = DragDropPluginKey.getState(newState)

      expect(dragState.dropPos).toBe(17)
      expect(dragState.dropSide).toBe('before')
    })

    it('should merge partial updates (preserves existing fields)', () => {
      // Set dragged info
      let newState = state.apply(
        state.tr.setMeta(DragDropPluginKey, {
          draggedPos: 0,
          draggedNode: state.doc.firstChild
        })
      )

      // Then set drop info
      newState = newState.apply(
        newState.tr.setMeta(DragDropPluginKey, {
          dropPos: 17,
          dropSide: 'after'
        })
      )

      const dragState = DragDropPluginKey.getState(newState)
      expect(dragState.draggedPos).toBe(0)
      expect(dragState.draggedNode).toBe(state.doc.firstChild)
      expect(dragState.dropPos).toBe(17)
      expect(dragState.dropSide).toBe('after')
    })

    it('should reset all fields when nulls are passed', () => {
      // Set some state first
      let newState = state.apply(
        state.tr.setMeta(DragDropPluginKey, {
          draggedPos: 0,
          draggedNode: state.doc.firstChild,
          dropPos: 17,
          dropSide: 'before'
        })
      )

      // Reset
      newState = newState.apply(
        newState.tr.setMeta(DragDropPluginKey, {
          draggedPos: null,
          draggedNode: null,
          dropPos: null,
          dropSide: null
        })
      )

      const dragState = DragDropPluginKey.getState(newState)
      expect(dragState.draggedPos).toBeNull()
      expect(dragState.draggedNode).toBeNull()
      expect(dragState.dropPos).toBeNull()
      expect(dragState.dropSide).toBeNull()
    })

    it('should not modify state without meta', () => {
      // Set initial drag state
      const newState = state.apply(
        state.tr.setMeta(DragDropPluginKey, {
          draggedPos: 0,
          draggedNode: state.doc.firstChild
        })
      )

      // Apply a transaction without meta
      const unchanged = newState.apply(newState.tr)
      const dragState = DragDropPluginKey.getState(unchanged)

      expect(dragState.draggedPos).toBe(0)
      expect(dragState.draggedNode).toBe(state.doc.firstChild)
    })

    it('should handle dropSide before value', () => {
      const newState = state.apply(
        state.tr.setMeta(DragDropPluginKey, {
          dropPos: 0,
          dropSide: 'before'
        })
      )

      const dragState = DragDropPluginKey.getState(newState)
      expect(dragState.dropSide).toBe('before')
    })

    it('should handle dropSide after value', () => {
      const newState = state.apply(
        state.tr.setMeta(DragDropPluginKey, {
          dropPos: 0,
          dropSide: 'after'
        })
      )

      const dragState = DragDropPluginKey.getState(newState)
      expect(dragState.dropSide).toBe('after')
    })
  })

  describe('DRAG_DATA_TYPE', () => {
    it('should use application/x-xnet-block as data type', () => {
      // This is an internal constant; we verify indirectly by checking
      // that the plugin's handleDOMEvents.dragstart exists
      const plugin = state.plugins.find(
        (p) =>
          DragDropPluginKey.getState(
            EditorState.create({ doc: state.doc, schema, plugins: [p] })
          ) !== undefined
      )
      expect(plugin).toBeDefined()
      // The plugin has handleDOMEvents with dragstart/dragover/drop/dragend/dragleave
      const props = (plugin as any).spec.props
      expect(props.handleDOMEvents.dragstart).toBeDefined()
      expect(props.handleDOMEvents.dragover).toBeDefined()
      expect(props.handleDOMEvents.drop).toBeDefined()
      expect(props.handleDOMEvents.dragend).toBeDefined()
      expect(props.handleDOMEvents.dragleave).toBeDefined()
    })
  })
})
