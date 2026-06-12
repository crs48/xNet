import { Editor } from '@tiptap/core'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TaskDueDateExtension, TaskMentionExtension } from '../task-metadata'
import {
  addTaskAssigneeToDoc,
  removeTaskAssigneeFromDoc,
  setTaskDueDateInDoc
} from './write-through'
import { PageTaskItemExtension } from './index'

const alice = {
  id: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  label: 'alice'
}

function taskItemContent(taskId: string, text: string, children: object[] = []) {
  return {
    type: 'taskItem',
    attrs: { checked: false, taskId, blockId: `block_${taskId}` },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...children]
  }
}

describe('page task write-through', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
        TaskList,
        PageTaskItemExtension.configure({ nested: true }),
        TaskMentionExtension.configure({ getSuggestions: () => [alice] }),
        TaskDueDateExtension
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              taskItemContent('task_outer', 'Outer task', [
                { type: 'taskList', content: [taskItemContent('task_inner', 'Inner task')] }
              ])
            ]
          }
        ]
      }
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  function mentionsIn(taskId: string): string[] {
    const ids: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'taskItem' && node.attrs.taskId === taskId) {
        node.forEach((child) => {
          if (child.type.name !== 'paragraph') return
          child.forEach((inline) => {
            if (inline.type.name === 'taskMention') ids.push(String(inline.attrs.id))
          })
        })
        return false
      }
      return true
    })
    return ids
  }

  function dueDates(): string[] {
    const dates: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'taskDueDate') dates.push(String(node.attrs.date))
    })
    return dates
  }

  it('adds a mention to the addressed task item only', () => {
    expect(addTaskAssigneeToDoc(editor, 'task_inner', alice)).toBe(true)

    expect(mentionsIn('task_inner')).toEqual([alice.id])
    expect(mentionsIn('task_outer')).toEqual([])
  })

  it('is idempotent for an already-assigned person', () => {
    expect(addTaskAssigneeToDoc(editor, 'task_outer', alice)).toBe(true)
    expect(addTaskAssigneeToDoc(editor, 'task_outer', alice)).toBe(false)

    expect(mentionsIn('task_outer')).toEqual([alice.id])
  })

  it('removes a mention by DID', () => {
    addTaskAssigneeToDoc(editor, 'task_outer', alice)

    expect(removeTaskAssigneeFromDoc(editor, 'task_outer', alice.id)).toBe(true)
    expect(mentionsIn('task_outer')).toEqual([])
    expect(removeTaskAssigneeFromDoc(editor, 'task_outer', alice.id)).toBe(false)
  })

  it('sets, replaces, and clears the due-date chip', () => {
    expect(setTaskDueDateInDoc(editor, 'task_outer', '2026-07-01')).toBe(true)
    expect(dueDates()).toEqual(['2026-07-01'])

    expect(setTaskDueDateInDoc(editor, 'task_outer', '2026-07-02')).toBe(true)
    expect(dueDates()).toEqual(['2026-07-02'])

    expect(setTaskDueDateInDoc(editor, 'task_outer', null)).toBe(true)
    expect(dueDates()).toEqual([])
  })

  it('returns false for unknown task ids', () => {
    expect(addTaskAssigneeToDoc(editor, 'task_missing', alice)).toBe(false)
    expect(setTaskDueDateInDoc(editor, 'task_missing', '2026-07-01')).toBe(false)
  })
})
