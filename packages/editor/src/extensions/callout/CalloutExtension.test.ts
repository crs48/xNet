import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { CalloutExtension } from './CalloutExtension'
import { CALLOUT_CONFIGS, type CalloutType } from './types'

describe('CalloutExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, CalloutExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('should register the callout node type', () => {
      expect(editor.schema.nodes.callout).toBeDefined()
    })

    it('should have correct default attributes', () => {
      const node = editor.schema.nodes.callout.create({}, editor.schema.nodes.paragraph.create())
      expect(node.attrs.type).toBe('info')
      expect(node.attrs.title).toBeNull()
      expect(node.attrs.collapsed).toBe(false)
    })

    it('should be a block node', () => {
      const spec = editor.schema.nodes.callout.spec
      expect(spec.group).toBe('block')
    })

    it('should accept block content', () => {
      const spec = editor.schema.nodes.callout.spec
      expect(spec.content).toBe('block+')
    })

    it('should be draggable', () => {
      const spec = editor.schema.nodes.callout.spec
      expect(spec.draggable).toBe(true)
    })
  })

  describe('setCallout command', () => {
    it('should wrap selection in a callout', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('info')

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout).toBeDefined()
      expect(callout?.attrs?.type).toBe('info')
    })

    it('should use default type when not specified', () => {
      editor.commands.selectAll()
      editor.commands.setCallout()

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout?.attrs?.type).toBe('info')
    })

    it('should set type to tip', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('tip')

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout?.attrs?.type).toBe('tip')
    })

    it('should set type to warning', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('warning')

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout?.attrs?.type).toBe('warning')
    })

    it('should set type to caution', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('caution')

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout?.attrs?.type).toBe('caution')
    })

    it('should preserve content inside callout', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('note')

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout') as any
      const paragraph = callout?.content?.find((n: any) => n.type === 'paragraph')
      expect(paragraph?.content?.[0]?.text).toBe('Hello world')
    })
  })

  describe('toggleCallout command', () => {
    it('should wrap in callout', () => {
      editor.commands.selectAll()
      editor.commands.toggleCallout('tip')

      const json = editor.getJSON()
      expect(json.content?.some((n) => n.type === 'callout')).toBe(true)
    })

    it('should unwrap when already in callout', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('info')

      // Position cursor inside the callout
      const calloutPos = findCalloutPos(editor)
      if (calloutPos >= 0) {
        // Move cursor inside the callout content
        editor.commands.setTextSelection(calloutPos + 2)
      }

      editor.commands.toggleCallout('info')

      const json = editor.getJSON()
      expect(json.content?.some((n) => n.type === 'callout')).toBe(false)
    })
  })

  describe('setCalloutType command', () => {
    it('should change callout type', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('info')

      // Position cursor inside
      const calloutPos = findCalloutPos(editor)
      if (calloutPos >= 0) {
        editor.commands.setTextSelection(calloutPos + 2)
      }

      editor.commands.setCalloutType('warning')

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout?.attrs?.type).toBe('warning')
    })
  })

  describe('setCalloutTitle command', () => {
    it('should set the callout title', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('info')

      const calloutPos = findCalloutPos(editor)
      if (calloutPos >= 0) {
        editor.commands.setTextSelection(calloutPos + 2)
      }

      editor.commands.setCalloutTitle('Important!')

      const json = editor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout?.attrs?.title).toBe('Important!')
    })
  })

  describe('parseHTML', () => {
    it('should parse div[data-callout]', () => {
      const editorWithCallout = new Editor({
        extensions: [StarterKit, CalloutExtension],
        content: '<div data-callout="warning" data-title="Watch out"><p>Content</p></div>'
      })

      const json = editorWithCallout.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout).toBeDefined()
      expect(callout?.attrs?.type).toBe('warning')
      expect(callout?.attrs?.title).toBe('Watch out')

      editorWithCallout.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render data-callout attribute', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('tip')

      const html = editor.getHTML()
      expect(html).toContain('data-callout="tip"')
    })

    it('should render callout class', () => {
      editor.commands.selectAll()
      editor.commands.setCallout('info')

      const html = editor.getHTML()
      expect(html).toContain('class="callout"')
    })
  })

  describe('options', () => {
    it('should accept custom default type', () => {
      const customEditor = new Editor({
        extensions: [StarterKit, CalloutExtension.configure({ defaultType: 'warning' })],
        content: '<p>Test</p>'
      })

      customEditor.commands.selectAll()
      customEditor.commands.setCallout()

      const json = customEditor.getJSON()
      const callout = json.content?.find((n) => n.type === 'callout')
      expect(callout?.attrs?.type).toBe('warning')

      customEditor.destroy()
    })
  })
})

describe('CALLOUT_CONFIGS', () => {
  it('should have all 6 callout types', () => {
    const types: CalloutType[] = ['info', 'tip', 'warning', 'caution', 'note', 'quote']
    for (const type of types) {
      expect(CALLOUT_CONFIGS[type]).toBeDefined()
    }
  })

  it('should have icon, label, and style classes for each type', () => {
    for (const [, config] of Object.entries(CALLOUT_CONFIGS)) {
      expect(config.icon).toBeTruthy()
      expect(config.label).toBeTruthy()
      expect(config.bgClass).toBeTruthy()
      expect(config.borderClass).toBeTruthy()
      expect(config.iconClass).toBeTruthy()
      expect(config.titleClass).toBeTruthy()
    }
  })
})

function findCalloutPos(editor: Editor): number {
  let pos = -1
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === 'callout' && pos === -1) {
      pos = nodePos
      return false
    }
  })
  return pos
}
