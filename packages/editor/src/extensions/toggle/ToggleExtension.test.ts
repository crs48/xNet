import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ToggleExtension } from './ToggleExtension'

describe('ToggleExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, ToggleExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('should register the toggle node type', () => {
      expect(editor.schema.nodes.toggle).toBeDefined()
    })

    it('should have correct default attributes', () => {
      const node = editor.schema.nodes.toggle.create({}, editor.schema.nodes.paragraph.create())
      expect(node.attrs.summary).toBe('Toggle')
      expect(node.attrs.open).toBe(true)
    })

    it('should be a block node', () => {
      expect(editor.schema.nodes.toggle.spec.group).toBe('block')
    })

    it('should accept block content', () => {
      expect(editor.schema.nodes.toggle.spec.content).toBe('block+')
    })

    it('should be draggable', () => {
      expect(editor.schema.nodes.toggle.spec.draggable).toBe(true)
    })
  })

  describe('setToggle command', () => {
    it('should insert a toggle', () => {
      editor.commands.setToggle()

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle).toBeDefined()
    })

    it('should default to open state', () => {
      editor.commands.setToggle()

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.open).toBe(true)
    })

    it('should have default summary "Toggle"', () => {
      editor.commands.setToggle()

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.summary).toBe('Toggle')
    })

    it('should accept custom summary', () => {
      editor.commands.setToggle('Custom Title')

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.summary).toBe('Custom Title')
    })

    it('should contain a paragraph', () => {
      editor.commands.setToggle()

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle') as any
      expect(toggle?.content?.[0]?.type).toBe('paragraph')
    })
  })

  describe('toggleExpanded command', () => {
    it('should toggle open state from open to closed', () => {
      editor.commands.setToggle()

      // Move cursor inside the toggle
      let togglePos = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'toggle' && togglePos === -1) {
          togglePos = pos
          return false
        }
      })

      // Position cursor inside toggle content
      editor.commands.setTextSelection(togglePos + 2)
      editor.commands.toggleExpanded()

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.open).toBe(false)
    })

    it('should toggle from closed to open', () => {
      editor.commands.setToggle()

      // Find and close it first
      let togglePos = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'toggle' && togglePos === -1) {
          togglePos = pos
          return false
        }
      })

      editor.commands.setTextSelection(togglePos + 2)
      editor.commands.toggleExpanded()

      // Now toggle again to re-open
      editor.commands.toggleExpanded()

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.open).toBe(true)
    })
  })

  describe('setToggleSummary command', () => {
    it('should update summary text', () => {
      editor.commands.setToggle()

      let togglePos = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'toggle' && togglePos === -1) {
          togglePos = pos
          return false
        }
      })

      editor.commands.setTextSelection(togglePos + 2)
      editor.commands.setToggleSummary('New Summary')

      const json = editor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.summary).toBe('New Summary')
    })
  })

  describe('parseHTML', () => {
    it('should parse details element', () => {
      const detailsEditor = new Editor({
        extensions: [StarterKit, ToggleExtension],
        content: '<details><summary>FAQ Item</summary><div><p>Answer here</p></div></details>'
      })

      const json = detailsEditor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle).toBeDefined()
      expect(toggle?.attrs?.summary).toBe('FAQ Item')

      detailsEditor.destroy()
    })

    it('should parse open attribute', () => {
      const openEditor = new Editor({
        extensions: [StarterKit, ToggleExtension],
        content: '<details open><summary>Open</summary><div><p>Content</p></div></details>'
      })

      const json = openEditor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.open).toBe(true)

      openEditor.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render as details element', () => {
      editor.commands.setToggle()

      const html = editor.getHTML()
      expect(html).toContain('<details')
      expect(html).toContain('<summary')
      expect(html).toContain('Toggle')
    })

    it('should include open attribute when open', () => {
      editor.commands.setToggle()

      const html = editor.getHTML()
      expect(html).toContain('open="open"')
    })
  })

  describe('options', () => {
    it('should accept defaultOpen: false', () => {
      const closedEditor = new Editor({
        extensions: [StarterKit, ToggleExtension.configure({ defaultOpen: false })],
        content: '<p>Test</p>'
      })

      closedEditor.commands.setToggle()

      const json = closedEditor.getJSON()
      const toggle = json.content?.find((n) => n.type === 'toggle')
      expect(toggle?.attrs?.open).toBe(false)

      closedEditor.destroy()
    })
  })
})
