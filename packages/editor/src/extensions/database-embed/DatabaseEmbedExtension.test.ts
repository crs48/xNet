import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseEmbedExtension } from './DatabaseEmbedExtension'

describe('DatabaseEmbedExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, DatabaseEmbedExtension],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('should register the databaseEmbed node type', () => {
      expect(editor.schema.nodes.databaseEmbed).toBeDefined()
    })

    it('should have correct default attributes', () => {
      const node = editor.schema.nodes.databaseEmbed.create()
      expect(node.attrs.databaseId).toBeNull()
      expect(node.attrs.viewType).toBe('table')
      expect(node.attrs.viewConfig).toEqual({})
      expect(node.attrs.showTitle).toBe(true)
      expect(node.attrs.maxHeight).toBe(400)
    })

    it('should be a block node', () => {
      const spec = editor.schema.nodes.databaseEmbed.spec
      expect(spec.group).toBe('block')
    })

    it('should be draggable', () => {
      const spec = editor.schema.nodes.databaseEmbed.spec
      expect(spec.draggable).toBe(true)
    })

    it('should be an atom node', () => {
      const spec = editor.schema.nodes.databaseEmbed.spec
      expect(spec.atom).toBe(true)
    })

    it('should be selectable and isolating for predictable block selection', () => {
      const spec = editor.schema.nodes.databaseEmbed.spec
      expect(spec.selectable).toBe(true)
      expect(spec.isolating).toBe(true)
    })
  })

  describe('setDatabaseEmbed command', () => {
    it('should insert a database embed with databaseId', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-123' })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode).toBeDefined()
      expect(embedNode?.attrs?.databaseId).toBe('db-123')
    })

    it('should default viewType to table', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-123' })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode?.attrs?.viewType).toBe('table')
    })

    it('should accept custom viewType', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-123', viewType: 'board' })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode?.attrs?.viewType).toBe('board')
    })

    it('should accept calendar viewType', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-123', viewType: 'calendar' })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode?.attrs?.viewType).toBe('calendar')
    })

    it('should accept gallery viewType', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-123', viewType: 'gallery' })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode?.attrs?.viewType).toBe('gallery')
    })

    it('should accept viewConfig', () => {
      editor.commands.setDatabaseEmbed({
        databaseId: 'db-123',
        viewConfig: { filter: { status: 'active' }, sortBy: 'title' }
      })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode?.attrs?.viewConfig).toEqual({
        filter: { status: 'active' },
        sortBy: 'title'
      })
    })

    it('should return false when databaseId is empty', () => {
      const result = editor.commands.setDatabaseEmbed({ databaseId: '' })
      expect(result).toBe(false)
    })

    it('should insert multiple embeds', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-1' })
      editor.commands.setDatabaseEmbed({ databaseId: 'db-2' })

      const json = editor.getJSON()
      const embedNodes = json.content?.filter((n) => n.type === 'databaseEmbed')
      expect(embedNodes?.length).toBe(2)
    })
  })

  describe('updateDatabaseView command', () => {
    it('should update viewType', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-123' })

      // Select the node
      const pos = findDbEmbedPos(editor)
      if (pos >= 0) {
        editor.commands.setNodeSelection(pos)
      }

      editor.commands.updateDatabaseView({ viewType: 'board' })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode?.attrs?.viewType).toBe('board')
    })

    it('should update viewConfig', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-123' })

      const pos = findDbEmbedPos(editor)
      if (pos >= 0) {
        editor.commands.setNodeSelection(pos)
      }

      editor.commands.updateDatabaseView({
        viewConfig: { groupBy: 'status' }
      })

      const json = editor.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode?.attrs?.viewConfig).toEqual({ groupBy: 'status' })
    })
  })

  describe('keyboard and selection behavior', () => {
    it('moves from selected embed to the following text block with ArrowDown', () => {
      const keyboardEditor = createEditorWithEmbeddedDatabase()
      const embedPosition = findDbEmbedPos(keyboardEditor)
      keyboardEditor.commands.setNodeSelection(embedPosition)

      const handled = triggerKeyDown(keyboardEditor, 'ArrowDown')

      expect(handled).toBe(true)
      expect(keyboardEditor.state.selection).not.toBeInstanceOf(NodeSelection)
      expect(keyboardEditor.state.selection.$from.parent.textContent).toBe('After')

      keyboardEditor.destroy()
    })

    it('moves from selected embed to the previous text block with ArrowUp', () => {
      const keyboardEditor = createEditorWithEmbeddedDatabase()
      const embedPosition = findDbEmbedPos(keyboardEditor)
      keyboardEditor.commands.setNodeSelection(embedPosition)

      const handled = triggerKeyDown(keyboardEditor, 'ArrowUp')

      expect(handled).toBe(true)
      expect(keyboardEditor.state.selection).not.toBeInstanceOf(NodeSelection)
      expect(keyboardEditor.state.selection.$from.parent.textContent).toBe('Before')

      keyboardEditor.destroy()
    })

    it('inserts an empty paragraph after a selected embed with Enter', () => {
      const keyboardEditor = createEditorWithEmbeddedDatabase()
      const embedPosition = findDbEmbedPos(keyboardEditor)
      keyboardEditor.commands.setNodeSelection(embedPosition)

      const handled = triggerKeyDown(keyboardEditor, 'Enter')

      expect(handled).toBe(true)
      expect(keyboardEditor.getJSON().content?.map((node) => node.type)).toEqual([
        'paragraph',
        'databaseEmbed',
        'paragraph',
        'paragraph'
      ])
      expect(keyboardEditor.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(keyboardEditor.state.selection.$from.parent.textContent).toBe('')

      keyboardEditor.destroy()
    })

    it('inserts an empty paragraph before a selected embed with Shift-Enter', () => {
      const keyboardEditor = createEditorWithEmbeddedDatabase()
      const embedPosition = findDbEmbedPos(keyboardEditor)
      keyboardEditor.commands.setNodeSelection(embedPosition)

      const handled = triggerKeyDown(keyboardEditor, 'Enter', { shiftKey: true })

      expect(handled).toBe(true)
      expect(keyboardEditor.getJSON().content?.map((node) => node.type)).toEqual([
        'paragraph',
        'paragraph',
        'databaseEmbed',
        'paragraph'
      ])
      expect(keyboardEditor.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(keyboardEditor.state.selection.$from.parent.textContent).toBe('')

      keyboardEditor.destroy()
    })

    it('does not intercept keyboard shortcuts when the embed is not selected', () => {
      const keyboardEditor = createEditorWithEmbeddedDatabase()
      keyboardEditor.commands.setTextSelection(2)

      expect(triggerKeyDown(keyboardEditor, 'ArrowDown')).toBe(false)

      keyboardEditor.destroy()
    })
  })

  describe('parseHTML', () => {
    it('should parse div[data-database-id]', () => {
      const editorWithEmbed = new Editor({
        extensions: [StarterKit, DatabaseEmbedExtension],
        content:
          '<div data-database-id="db-456" data-view-type="board" data-type="database-embed" databaseId="db-456" viewType="board"></div>'
      })

      const json = editorWithEmbed.getJSON()
      const embedNode = json.content?.find((n) => n.type === 'databaseEmbed')
      expect(embedNode).toBeDefined()

      editorWithEmbed.destroy()
    })
  })

  describe('renderHTML', () => {
    it('should render data-database-id attribute', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-789' })

      const html = editor.getHTML()
      expect(html).toContain('data-database-id="db-789"')
    })

    it('should render data-type attribute', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-789' })

      const html = editor.getHTML()
      expect(html).toContain('data-type="database-embed"')
    })

    it('should render data-view-type attribute', () => {
      editor.commands.setDatabaseEmbed({ databaseId: 'db-789', viewType: 'list' })

      const html = editor.getHTML()
      expect(html).toContain('data-view-type="list"')
    })
  })

  describe('options', () => {
    it('should default onSelectDatabase to undefined', () => {
      const ext = editor.extensionManager.extensions.find((e) => e.name === 'databaseEmbed')
      expect(ext?.options.onSelectDatabase).toBeUndefined()
    })

    it('should default renderView to undefined', () => {
      const ext = editor.extensionManager.extensions.find((e) => e.name === 'databaseEmbed')
      expect(ext?.options.renderView).toBeUndefined()
    })

    it('should default resolveDatabaseMeta to undefined', () => {
      const ext = editor.extensionManager.extensions.find((e) => e.name === 'databaseEmbed')
      expect(ext?.options.resolveDatabaseMeta).toBeUndefined()
    })

    it('should accept custom onSelectDatabase', () => {
      const mockSelect = async () => 'db-selected'
      const customEditor = new Editor({
        extensions: [
          StarterKit,
          DatabaseEmbedExtension.configure({ onSelectDatabase: mockSelect })
        ],
        content: '<p>Test</p>'
      })

      const ext = customEditor.extensionManager.extensions.find((e) => e.name === 'databaseEmbed')
      expect(ext?.options.onSelectDatabase).toBe(mockSelect)

      customEditor.destroy()
    })
  })
})

function findDbEmbedPos(editor: Editor): number {
  let pos = -1
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === 'databaseEmbed' && pos === -1) {
      pos = nodePos
      return false
    }
  })
  return pos
}

function createEditorWithEmbeddedDatabase(): Editor {
  return new Editor({
    extensions: [StarterKit, DatabaseEmbedExtension],
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Before' }]
        },
        {
          type: 'databaseEmbed',
          attrs: { databaseId: 'db-123', viewType: 'table' }
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'After' }]
        }
      ]
    }
  })
}

function triggerKeyDown(
  editor: Editor,
  key: string,
  options: { shiftKey?: boolean } = {}
): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true
  })
  let handled = false

  editor.view.someProp('handleKeyDown', (handler) => {
    if (handled) return true

    try {
      handled = handler(editor.view, event)
    } catch (error) {
      if (isMissingJsdomLayoutError(error)) return true
      throw error
    }

    return handled
  })

  return handled
}

function isMissingJsdomLayoutError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes('getClientRects')
}
