import { Editor } from '@tiptap/core'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PageTaskItemExtension } from '../page-tasks'
import { TaskDueDateExtension, TaskMentionExtension } from './index'

describe('task metadata extensions', () => {
  let editor: Editor
  const assignee = {
    id: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    label: 'alice'
  }

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
        TaskList,
        PageTaskItemExtension.configure({ nested: true }),
        TaskMentionExtension.configure({
          getSuggestions: () => [assignee]
        }),
        TaskDueDateExtension
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
                    content: [{ type: 'text', text: 'Review implementation' }]
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

  it('inserts canonical mention nodes with DID ids', () => {
    editor.commands.focus('end')

    expect(editor.commands.setTaskMention(assignee)).toBe(true)

    const mentions: Array<{ id?: string; label?: string }> = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'taskMention') {
        mentions.push({
          id: node.attrs.id,
          label: node.attrs.label
        })
      }
    })

    expect(mentions).toEqual([
      {
        id: assignee.id,
        label: assignee.label
      }
    ])
  })

  it('updates an existing due-date chip instead of duplicating it', () => {
    editor.commands.focus('end')

    expect(editor.commands.setTaskDueDate('2026-03-20')).toBe(true)
    expect(editor.commands.setTaskDueDate('2026-03-21')).toBe(true)

    const dueDates: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'taskDueDate' && typeof node.attrs.date === 'string') {
        dueDates.push(node.attrs.date)
      }
    })

    expect(dueDates).toEqual(['2026-03-21'])
  })
})
