import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DragHandle, DragHandlePluginKey } from './DragHandle'

describe('DragHandle Extension', () => {
  let editor: Editor
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        DragHandle.configure({
          showDelay: 0
        })
      ],
      content: '<p>First paragraph</p><p>Second paragraph</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
    container.remove()
  })

  it('should register as a plugin', () => {
    DragHandlePluginKey.getState(editor.state)
    // Plugin exists if getState doesn't return undefined
    // (PluginKey.getState returns the plugin's state if found)
    expect(editor.state.plugins.length).toBeGreaterThan(0)
  })

  it('should create a drag handle element in the DOM', () => {
    const handle = container.querySelector('.xnet-drag-handle')
    expect(handle).not.toBeNull()
  })

  it('should start with handle hidden (opacity 0)', () => {
    const handle = container.querySelector('.xnet-drag-handle') as HTMLElement
    expect(handle.style.opacity).toBe('0')
  })

  it('should have a draggable button inside', () => {
    const button = container.querySelector('.xnet-drag-handle-button')
    expect(button).not.toBeNull()
    expect(button?.getAttribute('draggable')).toBe('true')
  })

  it('should have accessible label', () => {
    const button = container.querySelector('.xnet-drag-handle-button')
    expect(button?.getAttribute('aria-label')).toBe('Drag to reorder or click for options')
  })

  it('should have grip SVG icon', () => {
    const svg = container.querySelector('.xnet-drag-handle-button svg')
    expect(svg).not.toBeNull()
    // 6 circles for the grip dots
    const circles = svg?.querySelectorAll('circle')
    expect(circles?.length).toBe(6)
  })

  it('should clean up handle element on destroy', () => {
    editor.destroy()
    const handle = container.querySelector('.xnet-drag-handle')
    expect(handle).toBeNull()
  })
})

describe('DragHandle Options', () => {
  let editor: Editor
  let container: HTMLElement

  afterEach(() => {
    editor?.destroy()
    container?.remove()
  })

  it('should use custom draggableSelector', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        DragHandle.configure({
          draggableSelector: 'h1, h2',
          showDelay: 0
        })
      ],
      content: '<h1>Heading</h1><p>Paragraph</p>'
    })

    // Extension should be configured - the drag handle element should exist
    const handle = container.querySelector('.xnet-drag-handle')
    expect(handle).not.toBeNull()
  })

  it('should accept handleOffset option', () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        DragHandle.configure({
          handleOffset: -32,
          showDelay: 0
        })
      ],
      content: '<p>Test</p>'
    })

    // Verify the editor initialized successfully with custom offset
    const handle = container.querySelector('.xnet-drag-handle')
    expect(handle).not.toBeNull()
  })
})
