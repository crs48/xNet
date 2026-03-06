import { Editor } from '@tiptap/core'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SmartReferenceExtension } from '../smart-reference'
import { PageTaskItemExtension, collectPageTasks, ensurePageTaskAttrs } from './index'

describe('PageTaskItemExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
        TaskList,
        PageTaskItemExtension.configure({ nested: true }),
        SmartReferenceExtension
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Parent task' }]
                  },
                  {
                    type: 'taskList',
                    content: [
                      {
                        type: 'taskItem',
                        attrs: { checked: true },
                        content: [
                          {
                            type: 'paragraph',
                            content: [
                              { type: 'text', text: 'Child task ' },
                              {
                                type: 'smartReference',
                                attrs: {
                                  url: 'https://github.com/openai/openai/issues/123',
                                  provider: 'github',
                                  kind: 'issue',
                                  refId: 'openai/openai#123',
                                  title: 'Issue #123',
                                  subtitle: 'openai/openai',
                                  icon: 'GH',
                                  embedUrl: null,
                                  metadata: '{"repo":"openai/openai"}'
                                }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('adds stable task metadata attrs to task items', () => {
    const changed = ensurePageTaskAttrs(editor)

    expect(changed).toBe(true)

    const taskItems: Array<{ attrs?: Record<string, unknown> }> = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'taskItem') taskItems.push({ attrs: node.attrs })
    })

    expect(taskItems).toHaveLength(2)
    expect(taskItems[0].attrs?.taskId).toEqual(expect.any(String))
    expect(taskItems[0].attrs?.blockId).toEqual(expect.any(String))
    expect(taskItems[1].attrs?.taskId).toEqual(expect.any(String))
    expect(taskItems[1].attrs?.blockId).toEqual(expect.any(String))
  })

  it('collects parent-child task snapshots and smart references', () => {
    ensurePageTaskAttrs(editor)

    const { tasks, attrUpdates } = collectPageTasks(editor.state.doc)

    expect(attrUpdates).toHaveLength(0)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({
      title: 'Parent task',
      completed: false,
      parentTaskId: null,
      sortKey: '0000'
    })
    expect(tasks[1]).toMatchObject({
      title: 'Child task',
      completed: true,
      parentTaskId: tasks[0].taskId,
      sortKey: '0000.0000'
    })
    expect(tasks[1].references).toEqual([
      expect.objectContaining({
        provider: 'github',
        kind: 'issue',
        refId: 'openai/openai#123'
      })
    ])
  })
})
