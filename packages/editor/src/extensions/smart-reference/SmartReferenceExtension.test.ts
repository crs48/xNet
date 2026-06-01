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

    it('renders smart references as compact inline chips', () => {
      editor.commands.setContent('<p></p>')
      editor.commands.setSmartReference('https://github.com/openai/openai/issues/123')

      const html = editor.getHTML()
      expect(html).toContain('data-smart-reference')
      expect(html).toContain('data-provider="github"')
      expect(html).toContain('data-kind="issue"')
      expect(html).toContain('data-ref-id="openai/openai#123"')
      expect(html).toContain('class="smart-reference smart-reference--github"')
      expect(html).toContain('aria-label="openai#123, openai"')
      expect(html).not.toContain('<iframe')
    })

    it('updates selected smart reference display metadata in place', () => {
      editor.commands.setContent('<p>Track </p>')
      editor.commands.setTextSelection(7)
      editor.commands.setSmartReference('https://github.com/openai/openai/issues/123')

      const position = findSmartReferencePos(editor)
      editor.commands.setNodeSelection(position)

      expect(
        editor.commands.updateSmartReference({
          title: 'Launch blocker',
          subtitle: 'Triaged issue',
          metadata: { status: 'triaged' }
        })
      ).toBe(true)

      const smartReference = getFirstSmartReference(editor)
      expect(smartReference?.attrs).toMatchObject({
        title: 'Launch blocker',
        subtitle: 'Triaged issue',
        metadata: JSON.stringify({ status: 'triaged' })
      })
      expect(editor.getText()).toContain('Track')
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

function getFirstSmartReference(editor: Editor) {
  const paragraph = editor.getJSON().content?.find((node) => node.type === 'paragraph')
  return paragraph?.content?.find((node) => node.type === 'smartReference') ?? null
}

function findSmartReferencePos(editor: Editor): number {
  let pos = -1
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === 'smartReference' && pos === -1) {
      pos = nodePos
      return false
    }
  })
  return pos
}
