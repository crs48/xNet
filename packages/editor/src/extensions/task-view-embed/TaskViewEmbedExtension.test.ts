import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TaskViewEmbedExtension } from './index'

describe('TaskViewEmbedExtension', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, TaskViewEmbedExtension]
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  it('registers the taskViewEmbed node type', () => {
    expect(editor.schema.nodes.taskViewEmbed).toBeDefined()
  })

  it('inserts a task view embed with persisted filters', () => {
    expect(
      editor.commands.setTaskViewEmbed({
        viewConfig: {
          scope: 'all',
          assignee: 'me',
          dueDate: 'overdue',
          status: 'done',
          showHierarchy: false
        }
      })
    ).toBe(true)

    const json = editor.getJSON()
    const embedNode = json.content?.find((node) => node.type === 'taskViewEmbed')

    expect(embedNode?.attrs).toMatchObject({
      viewType: 'list',
      viewConfig: {
        scope: 'all',
        assignee: 'me',
        dueDate: 'overdue',
        status: 'done',
        showHierarchy: false
      }
    })
  })

  it('updates the current task view embed filters', () => {
    editor.commands.setTaskViewEmbed({
      viewConfig: {
        scope: 'all',
        assignee: 'me',
        dueDate: 'overdue'
      }
    })

    let embedPosition = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'taskViewEmbed' && embedPosition === -1) {
        embedPosition = pos
      }
    })

    expect(embedPosition).toBeGreaterThanOrEqual(0)
    editor.commands.setNodeSelection(embedPosition)
    editor.commands.updateTaskViewEmbed({
      viewConfig: {
        dueDate: 'today',
        status: 'all'
      }
    })

    const json = editor.getJSON()
    const embedNode = json.content?.find((node) => node.type === 'taskViewEmbed')

    expect(embedNode?.attrs?.viewConfig).toMatchObject({
      scope: 'all',
      assignee: 'me',
      dueDate: 'today',
      status: 'all',
      showHierarchy: true
    })
  })
})
