/**
 * Tests for @xnet/editor extensions
 */
import { describe, it, expect, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Wikilink, LivePreview, MARK_SYNTAX } from './extensions'

// Helper to create a test editor with our extensions
function createTestEditor(
  options: {
    content?: string
    onNavigate?: (pageId: string) => void
  } = {}
) {
  const { content = '<p></p>', onNavigate = () => {} } = options

  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Wikilink.configure({ onNavigate }), LivePreview],
    content
  })
}

describe('Wikilink Extension', () => {
  describe('configuration', () => {
    it('should accept onNavigate callback', () => {
      const onNavigate = vi.fn()
      const editor = createTestEditor({ onNavigate })

      const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'wikilink')
      expect(extension?.options.onNavigate).toBe(onNavigate)

      editor.destroy()
    })

    it('should have default empty onNavigate', () => {
      const editor = new Editor({
        element: document.createElement('div'),
        extensions: [StarterKit, Wikilink],
        content: '<p></p>'
      })

      const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'wikilink')
      expect(typeof extension?.options.onNavigate).toBe('function')

      editor.destroy()
    })
  })

  describe('schema', () => {
    it('should define wikilink mark in schema', () => {
      const editor = createTestEditor()

      const schema = editor.schema
      const wikilinkMark = schema.marks.wikilink
      expect(wikilinkMark).toBeDefined()

      editor.destroy()
    })

    it('should define href attribute', () => {
      const editor = createTestEditor()

      const schema = editor.schema
      const wikilinkMark = schema.marks.wikilink
      expect(wikilinkMark.spec.attrs?.href).toBeDefined()

      editor.destroy()
    })

    it('should define title attribute', () => {
      const editor = createTestEditor()

      const schema = editor.schema
      const wikilinkMark = schema.marks.wikilink
      expect(wikilinkMark.spec.attrs?.title).toBeDefined()

      editor.destroy()
    })
  })

  describe('parseHTML', () => {
    it('should have parseHTML configuration', () => {
      const editor = createTestEditor()

      const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'wikilink')

      expect(extension?.config?.parseHTML).toBeDefined()

      editor.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render with wikilink class and data attribute', () => {
      const editor = createTestEditor()

      // Apply wikilink mark manually
      editor.commands.setContent('<p>test</p>')
      editor.commands.selectAll()
      editor.commands.setMark('wikilink', { href: 'test-page', title: 'Test' })

      const html = editor.getHTML()
      expect(html).toContain('data-wikilink')
      expect(html).toContain('class="wikilink"')

      editor.destroy()
    })
  })

  describe('input rules', () => {
    it('should have addInputRules method', () => {
      const editor = createTestEditor()

      const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'wikilink')

      expect(extension?.config?.addInputRules).toBeDefined()

      editor.destroy()
    })
  })
})

describe('LivePreview Extension', () => {
  describe('MARK_SYNTAX mapping', () => {
    it('should have correct syntax for bold', () => {
      expect(MARK_SYNTAX.bold).toMatchObject({ open: '**', close: '**' })
    })

    it('should have correct syntax for italic', () => {
      expect(MARK_SYNTAX.italic).toMatchObject({ open: '*', close: '*' })
    })

    it('should have correct syntax for strike', () => {
      expect(MARK_SYNTAX.strike).toMatchObject({ open: '~~', close: '~~' })
    })

    it('should have correct syntax for code', () => {
      expect(MARK_SYNTAX.code).toMatchObject({ open: '`', close: '`' })
    })
  })

  describe('configuration', () => {
    it('should default to standard marks', () => {
      const editor = createTestEditor()

      const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'livePreview')
      expect(extension?.options.marks).toEqual(['bold', 'italic', 'strike', 'code'])

      editor.destroy()
    })

    it('should accept custom marks option', () => {
      const editor = new Editor({
        element: document.createElement('div'),
        extensions: [StarterKit, LivePreview.configure({ marks: ['bold', 'italic'] })],
        content: '<p></p>'
      })

      const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'livePreview')
      expect(extension?.options.marks).toEqual(['bold', 'italic'])

      editor.destroy()
    })
  })

  describe('ProseMirror plugin', () => {
    it('should have addProseMirrorPlugins method', () => {
      const editor = createTestEditor()

      const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'livePreview')

      expect(extension?.config?.addProseMirrorPlugins).toBeDefined()

      editor.destroy()
    })

    it('should have plugins in editor state', () => {
      const editor = createTestEditor()

      expect(editor.state.plugins.length).toBeGreaterThan(0)

      editor.destroy()
    })
  })
})

describe('Extension Integration', () => {
  it('should register wikilink extension', () => {
    const editor = createTestEditor()

    const extensionNames = editor.extensionManager.extensions.map((e) => e.name)
    expect(extensionNames).toContain('wikilink')

    editor.destroy()
  })

  it('should register livePreview extension', () => {
    const editor = createTestEditor()

    const extensionNames = editor.extensionManager.extensions.map((e) => e.name)
    expect(extensionNames).toContain('livePreview')

    editor.destroy()
  })

  it('should work with formatting marks', () => {
    const editor = createTestEditor({
      content: '<p>Hello world</p>'
    })

    editor.commands.selectAll()
    editor.commands.toggleBold()

    expect(editor.isActive('bold')).toBe(true)

    editor.destroy()
  })

  it('should coexist with other marks', () => {
    const editor = createTestEditor({
      content: '<p>test text</p>'
    })

    editor.commands.selectAll()
    editor.commands.toggleBold()
    editor.commands.toggleItalic()

    expect(editor.isActive('bold')).toBe(true)
    expect(editor.isActive('italic')).toBe(true)

    editor.destroy()
  })
})
