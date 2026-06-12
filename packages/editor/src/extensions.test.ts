/**
 * Tests for @xnetjs/editor extensions
 */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, it, expect, vi } from 'vitest'
import {
  Wikilink,
  LivePreview,
  MARK_SYNTAX,
  serializeWikilink,
  tokenizeWikilink
} from './extensions'

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

  describe('navigation', () => {
    it('calls onNavigate when a wikilink is clicked', () => {
      const onNavigate = vi.fn()
      const editor = createTestEditor({
        onNavigate,
        content:
          '<p><a data-wikilink href="default/launch-plan" title="Launch Plan">Launch Plan</a></p>'
      })
      const anchor = editor.view.dom.querySelector('a[data-wikilink]')
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      expect(anchor).toBeInstanceOf(HTMLAnchorElement)
      Object.defineProperty(event, 'target', { value: anchor })
      let handled = false

      editor.view.someProp('handleClick', (handler) => {
        if (handled) {
          return
        }

        handled = handler(editor.view, 1, event) === true
      })

      expect(handled).toBe(true)
      expect(event.defaultPrevented).toBe(true)
      expect(onNavigate).toHaveBeenCalledWith('default/launch-plan')

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

describe('Wikilink markdown round trip (0170)', () => {
  describe('serializeWikilink', () => {
    it('emits legacy [[title]] when the href is the derived slug', () => {
      expect(serializeWikilink('default/launch-plan', 'Launch Plan')).toBe('[[Launch Plan]]')
    })

    it('emits legacy [[title]] when the href is missing', () => {
      expect(serializeWikilink(null, 'Launch Plan')).toBe('[[Launch Plan]]')
    })

    it('emits [[target|title]] for node-id hrefs', () => {
      expect(serializeWikilink('V1StGXR8_Z5jdHi6B-myT', 'Launch Plan')).toBe(
        '[[V1StGXR8_Z5jdHi6B-myT|Launch Plan]]'
      )
    })

    it('emits [[target|title]] for xnet:// hrefs', () => {
      expect(serializeWikilink('xnet://database/abc', 'Q3 Tracker')).toBe(
        '[[xnet://database/abc|Q3 Tracker]]'
      )
    })
  })

  describe('tokenizeWikilink', () => {
    it('tokenizes legacy [[title]] with a derived slug href', () => {
      const token = tokenizeWikilink('[[Launch Plan]] and more')
      expect(token).toMatchObject({
        raw: '[[Launch Plan]]',
        text: 'Launch Plan',
        href: 'default/launch-plan'
      })
    })

    it('tokenizes [[target|label]] keeping the explicit target', () => {
      const token = tokenizeWikilink('[[V1StGXR8_Z5jdHi6B-myT|Launch Plan]]')
      expect(token).toMatchObject({ text: 'Launch Plan', href: 'V1StGXR8_Z5jdHi6B-myT' })
    })

    it('returns undefined for non-links and empty targets', () => {
      expect(tokenizeWikilink('plain text')).toBeUndefined()
      expect(tokenizeWikilink('[[ ]]')).toBeUndefined()
    })

    it('round-trips serialized links', () => {
      const source = serializeWikilink('xnet://dashboard/dash-1', 'Metrics')
      const token = tokenizeWikilink(source)
      expect(token).toMatchObject({ text: 'Metrics', href: 'xnet://dashboard/dash-1' })
      expect(serializeWikilink(token?.href, token?.text ?? '')).toBe(source)
    })
  })
})

describe('serializeWikilink placeholder text', () => {
  it('keeps the legacy form when text is a render placeholder but the title matches the slug', () => {
    expect(
      serializeWikilink('default/roadmap-page', 'Roadmap Page', '__TIPTAP_MARKDOWN_PLACEHOLDER__')
    ).toBe('[[__TIPTAP_MARKDOWN_PLACEHOLDER__]]')
  })

  it('uses alias form with placeholder text for explicit targets', () => {
    expect(serializeWikilink('node-id-x', 'Roadmap Page', 'PLACEHOLDER')).toBe(
      '[[node-id-x|PLACEHOLDER]]'
    )
  })
})
