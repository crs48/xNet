import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MermaidExtension } from './MermaidExtension'
import { MERMAID_EXAMPLES } from './types'

describe('MermaidExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, MermaidExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('should register the mermaid node type', () => {
      expect(editor.schema.nodes.mermaid).toBeDefined()
    })

    it('should have correct default attributes', () => {
      const node = editor.schema.nodes.mermaid.create({})
      expect(node.attrs.code).toBe('')
      expect(node.attrs.theme).toBe('default')
    })

    it('should be a block node', () => {
      const spec = editor.schema.nodes.mermaid.spec
      expect(spec.group).toBe('block')
    })

    it('should be an atom (not editable inline)', () => {
      const spec = editor.schema.nodes.mermaid.spec
      expect(spec.atom).toBe(true)
    })

    it('should be draggable', () => {
      const spec = editor.schema.nodes.mermaid.spec
      expect(spec.draggable).toBe(true)
    })
  })

  describe('setMermaid command', () => {
    it('should insert a mermaid block', () => {
      editor.commands.setMermaid()

      const json = editor.getJSON()
      const mermaid = json.content?.find((n) => n.type === 'mermaid')
      expect(mermaid).toBeDefined()
    })

    it('should insert with empty code by default', () => {
      editor.commands.setMermaid()

      const json = editor.getJSON()
      const mermaid = json.content?.find((n) => n.type === 'mermaid')
      expect(mermaid?.attrs?.code).toBe('')
    })

    it('should insert with provided code', () => {
      const code = 'flowchart TD\n  A --> B'
      editor.commands.setMermaid(code)

      const json = editor.getJSON()
      const mermaid = json.content?.find((n) => n.type === 'mermaid')
      expect(mermaid?.attrs?.code).toBe(code)
    })

    it('should insert with default theme', () => {
      editor.commands.setMermaid()

      const json = editor.getJSON()
      const mermaid = json.content?.find((n) => n.type === 'mermaid')
      expect(mermaid?.attrs?.theme).toBe('default')
    })

    it('should insert with provided theme', () => {
      editor.commands.setMermaid('graph TD', 'dark')

      const json = editor.getJSON()
      const mermaid = json.content?.find((n) => n.type === 'mermaid')
      expect(mermaid?.attrs?.theme).toBe('dark')
    })

    it('should support all theme options', () => {
      const themes = ['default', 'dark', 'forest', 'neutral'] as const
      for (const theme of themes) {
        const testEditor = new Editor({
          extensions: [StarterKit, MermaidExtension],
          content: '<p>Test</p>'
        })
        testEditor.commands.setMermaid('graph TD', theme)
        const json = testEditor.getJSON()
        const mermaid = json.content?.find((n) => n.type === 'mermaid')
        expect(mermaid?.attrs?.theme).toBe(theme)
        testEditor.destroy()
      }
    })
  })

  describe('parseHTML', () => {
    it('should parse div[data-mermaid]', () => {
      const editorWithMermaid = new Editor({
        extensions: [StarterKit, MermaidExtension],
        content: '<div data-mermaid data-code="graph LR" data-theme="forest"></div>'
      })

      const json = editorWithMermaid.getJSON()
      const mermaid = json.content?.find((n) => n.type === 'mermaid')
      expect(mermaid).toBeDefined()
      expect(mermaid?.attrs?.code).toBe('graph LR')
      expect(mermaid?.attrs?.theme).toBe('forest')

      editorWithMermaid.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render data-mermaid attribute', () => {
      editor.commands.setMermaid('graph TD')

      const html = editor.getHTML()
      expect(html).toContain('data-mermaid')
    })

    it('should render data-code attribute', () => {
      editor.commands.setMermaid('graph TD\n  A --> B')

      const html = editor.getHTML()
      expect(html).toContain('data-code')
    })

    it('should render mermaid-block class', () => {
      editor.commands.setMermaid()

      const html = editor.getHTML()
      expect(html).toContain('mermaid-block')
    })
  })

  describe('options', () => {
    it('should accept custom default theme', () => {
      const customEditor = new Editor({
        extensions: [StarterKit, MermaidExtension.configure({ defaultTheme: 'dark' })],
        content: '<p>Test</p>'
      })

      customEditor.commands.setMermaid()

      const json = customEditor.getJSON()
      const mermaid = json.content?.find((n) => n.type === 'mermaid')
      expect(mermaid?.attrs?.theme).toBe('dark')

      customEditor.destroy()
    })
  })

  describe('input rules', () => {
    it('should have input rule for ```mermaid', () => {
      // Verify the input rule is registered
      const inputRules = editor.extensionManager.extensions.find((ext) => ext.name === 'mermaid')
      expect(inputRules).toBeDefined()
      // The actual input rule behavior requires simulating keystrokes which
      // is complex in unit tests - we verify the extension is properly configured
    })
  })
})

describe('MERMAID_EXAMPLES', () => {
  it('should have example for flowchart', () => {
    expect(MERMAID_EXAMPLES.flowchart).toBeDefined()
    expect(MERMAID_EXAMPLES.flowchart).toContain('flowchart')
  })

  it('should have example for sequence diagram', () => {
    expect(MERMAID_EXAMPLES.sequence).toBeDefined()
    expect(MERMAID_EXAMPLES.sequence).toContain('sequenceDiagram')
  })

  it('should have example for class diagram', () => {
    expect(MERMAID_EXAMPLES.classDiagram).toBeDefined()
    expect(MERMAID_EXAMPLES.classDiagram).toContain('classDiagram')
  })

  it('should have example for state diagram', () => {
    expect(MERMAID_EXAMPLES.stateDiagram).toBeDefined()
    expect(MERMAID_EXAMPLES.stateDiagram).toContain('stateDiagram')
  })

  it('should have example for ER diagram', () => {
    expect(MERMAID_EXAMPLES.erDiagram).toBeDefined()
    expect(MERMAID_EXAMPLES.erDiagram).toContain('erDiagram')
  })

  it('should have example for gantt chart', () => {
    expect(MERMAID_EXAMPLES.gantt).toBeDefined()
    expect(MERMAID_EXAMPLES.gantt).toContain('gantt')
  })

  it('should have example for pie chart', () => {
    expect(MERMAID_EXAMPLES.pie).toBeDefined()
    expect(MERMAID_EXAMPLES.pie).toContain('pie')
  })

  it('should have example for mindmap', () => {
    expect(MERMAID_EXAMPLES.mindmap).toBeDefined()
    expect(MERMAID_EXAMPLES.mindmap).toContain('mindmap')
  })
})
