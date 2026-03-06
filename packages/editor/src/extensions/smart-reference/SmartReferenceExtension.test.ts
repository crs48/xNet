import { Editor } from '@tiptap/core'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SmartReferenceExtension } from './SmartReferenceExtension'

describe('SmartReferenceExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        SmartReferenceExtension
      ],
      content: '<p>Hello world</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  describe('schema', () => {
    it('registers the smartReference node type', () => {
      expect(editor.schema.nodes.smartReference).toBeDefined()
    })

    it('is an inline atom', () => {
      const spec = editor.schema.nodes.smartReference.spec
      expect(spec.group).toBe('inline')
      expect(spec.inline).toBe(true)
      expect(spec.atom).toBe(true)
    })
  })

  describe('setSmartReference command', () => {
    it('inserts a GitHub issue chip', () => {
      const result = editor.commands.setSmartReference(
        'https://github.com/openai/openai/issues/123'
      )
      expect(result).toBe(true)

      const json = editor.getJSON()
      const paragraph = json.content?.find((node) => node.type === 'paragraph')
      const smartReference = paragraph?.content?.find((node) => node.type === 'smartReference')
      expect(smartReference?.attrs).toMatchObject({
        provider: 'github',
        kind: 'issue',
        refId: 'openai/openai#123'
      })
    })

    it('returns false for unsupported URLs', () => {
      const result = editor.commands.setSmartReference('https://example.com/docs/123')
      expect(result).toBe(false)
    })
  })

  describe('task paste conversion', () => {
    it('converts supported pasted URLs into smart references inside task items', () => {
      editor.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph' }]
              }
            ]
          }
        ]
      })

      editor.commands.setTextSelection(3)

      const pastePlugin = editor.state.plugins.find((plugin) =>
        String((plugin as { key?: string }).key).includes('smartReferencePaste')
      )

      expect(pastePlugin?.props.handlePaste).toBeDefined()

      const event = {
        clipboardData: {
          getData: (type: string) =>
            type === 'text/plain' ? 'https://www.figma.com/file/abc123def' : ''
        },
        preventDefault: () => {}
      } as ClipboardEvent

      const handled = pastePlugin?.props.handlePaste?.(editor.view, event)
      expect(handled).toBe(true)

      const json = editor.getJSON()
      const smartReference =
        json.content?.[0]?.content?.[0]?.content?.[0]?.content?.find(
          (node) => node.type === 'smartReference'
        ) ?? null

      expect(smartReference?.attrs).toMatchObject({
        provider: 'figma',
        kind: 'design',
        refId: 'file/abc123def'
      })
    })
  })
})
