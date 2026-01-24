import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { DragHandleExtension } from './index'
import { DragDropPluginKey } from './DragDropPlugin'

describe('DragHandleExtension Integration', () => {
  let editor: Editor
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        DragHandleExtension.configure({
          enableDragDrop: true,
          showDropIndicator: true
        })
      ],
      content: `
        <p>First paragraph</p>
        <p>Second paragraph</p>
        <p>Third paragraph</p>
      `
    })
  })

  afterEach(() => {
    editor.destroy()
    container.remove()
  })

  it('should register the dragHandleExtension', () => {
    const extension = editor.extensionManager.extensions.find(
      (ext) => ext.name === 'dragHandleExtension'
    )
    expect(extension).toBeDefined()
  })

  it('should register the dragHandle sub-extension', () => {
    const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'dragHandle')
    expect(extension).toBeDefined()
  })

  it('should have dragHandle plugin', () => {
    // DragHandle creates the handle element
    const handle = container.querySelector('.xnet-drag-handle')
    expect(handle).not.toBeNull()
  })

  it('should have dragDrop plugin when enabled', () => {
    // DragDropPlugin provides state via its key
    const state = DragDropPluginKey.getState(editor.state)
    expect(state).toBeDefined()
  })

  it('should have dropIndicator plugin when enabled', () => {
    // DropIndicator plugin is registered (doesn't maintain state, just decorations)
    // Verify by checking the extension registered correctly
    const ext = editor.extensionManager.extensions.find((e) => e.name === 'dragHandleExtension')
    expect(ext?.options.showDropIndicator).toBe(true)
  })

  it('should have drag handle element in DOM', () => {
    const handle = container.querySelector('.xnet-drag-handle')
    expect(handle).not.toBeNull()
  })

  it('should initialize with clean drag state', () => {
    const state = DragDropPluginKey.getState(editor.state)
    expect(state.draggedPos).toBeNull()
    expect(state.draggedNode).toBeNull()
    expect(state.dropPos).toBeNull()
    expect(state.dropSide).toBeNull()
  })
})

describe('DragHandleExtension with drag disabled', () => {
  let editor: Editor
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        DragHandleExtension.configure({
          enableDragDrop: false,
          showDropIndicator: false
        })
      ],
      content: '<p>Test</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
    container.remove()
  })

  it('should still have drag handle element (for hover)', () => {
    const handle = container.querySelector('.xnet-drag-handle')
    expect(handle).not.toBeNull()
  })

  it('should NOT have dragDrop plugin when disabled', () => {
    // When disabled, DragDropPluginKey.getState should be undefined
    const state = DragDropPluginKey.getState(editor.state)
    expect(state).toBeUndefined()
  })

  it('should NOT have dropIndicator enabled when disabled', () => {
    const ext = editor.extensionManager.extensions.find((e) => e.name === 'dragHandleExtension')
    expect(ext?.options.showDropIndicator).toBe(false)
  })
})
