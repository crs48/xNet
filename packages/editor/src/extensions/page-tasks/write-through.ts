/**
 * Node → editor write-through for page task metadata.
 *
 * Page checklists own a task's title, assignees, and due date (see
 * docs/specs/PAGE_TASK_RECONCILIATION.md): the inline metadata is the
 * source of truth and the Task node mirrors it on every snapshot. So
 * panels that edit a *hosted* task must mutate the host document, not
 * the node — these helpers address a taskItem by `taskId` and edit its
 * inline metadata; the resulting editor update publishes a snapshot that
 * reconciles the node.
 */
import type { TaskMentionSuggestion } from '../../components/TaskMentionMenu'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

interface NodeAt {
  node: ProseMirrorNode
  pos: number
}

function findTaskItem(editor: Editor, taskId: string): NodeAt | null {
  let match: NodeAt | null = null

  editor.state.doc.descendants((node, pos) => {
    if (match) return false
    if (node.type.name === 'taskItem' && node.attrs.taskId === taskId) {
      match = { node, pos }
      return false
    }
    return true
  })

  return match
}

/**
 * Find an inline metadata node inside a task item without descending
 * into nested subtask items (their metadata belongs to them).
 */
function findInlineNode(
  taskItem: NodeAt,
  predicate: (node: ProseMirrorNode) => boolean
): NodeAt | null {
  let match: NodeAt | null = null

  const visit = (node: ProseMirrorNode, pos: number): void => {
    node.forEach((child, offset) => {
      if (match) return
      if (child.type.name === 'taskItem' || child.type.name === 'taskList') return

      const childPos = pos + offset + 1
      if (predicate(child)) {
        match = { node: child, pos: childPos }
        return
      }
      visit(child, childPos)
    })
  }

  visit(taskItem.node, taskItem.pos)
  return match
}

/** End-of-content position of the task item's first paragraph. */
function firstParagraphEnd(taskItem: NodeAt): number | null {
  let result: number | null = null

  taskItem.node.forEach((child, offset) => {
    if (result !== null || child.type.name !== 'paragraph') return
    const childPos = taskItem.pos + offset + 1
    result = childPos + child.nodeSize - 1
  })

  return result
}

/** Append a metadata node at the end of the item's first paragraph. */
function appendInline(editor: Editor, taskItem: NodeAt, node: ProseMirrorNode): boolean {
  const end = firstParagraphEnd(taskItem)
  if (end == null) return false

  const { tr, schema } = editor.state
  editor.view.dispatch(tr.insert(end, [schema.text(' '), node]))
  return true
}

/** Insert a `@mention` for `suggestion` into the hosted task's text. */
export function addTaskAssigneeToDoc(
  editor: Editor,
  taskId: string,
  suggestion: TaskMentionSuggestion
): boolean {
  const taskItem = findTaskItem(editor, taskId)
  if (!taskItem) return false

  const existing = findInlineNode(
    taskItem,
    (node) => node.type.name === 'taskMention' && node.attrs.id === suggestion.id
  )
  if (existing) return false

  const mentionType = editor.state.schema.nodes.taskMention
  if (!mentionType) return false

  return appendInline(
    editor,
    taskItem,
    mentionType.create({
      id: suggestion.id,
      label: suggestion.label,
      subtitle: suggestion.subtitle ?? null,
      color: suggestion.color ?? null
    })
  )
}

/** Remove the `@mention` whose id is `did` from the hosted task's text. */
export function removeTaskAssigneeFromDoc(editor: Editor, taskId: string, did: string): boolean {
  const taskItem = findTaskItem(editor, taskId)
  if (!taskItem) return false

  const mention = findInlineNode(
    taskItem,
    (node) => node.type.name === 'taskMention' && node.attrs.id === did
  )
  if (!mention) return false

  editor.view.dispatch(editor.state.tr.delete(mention.pos, mention.pos + mention.node.nodeSize))
  return true
}

/** Set (YYYY-MM-DD) or clear (null) the hosted task's due-date chip. */
export function setTaskDueDateInDoc(editor: Editor, taskId: string, date: string | null): boolean {
  const taskItem = findTaskItem(editor, taskId)
  if (!taskItem) return false

  const existing = findInlineNode(taskItem, (node) => node.type.name === 'taskDueDate')

  if (date === null) {
    if (!existing) return false
    editor.view.dispatch(
      editor.state.tr.delete(existing.pos, existing.pos + existing.node.nodeSize)
    )
    return true
  }

  const dueDateType = editor.state.schema.nodes.taskDueDate
  if (!dueDateType) return false

  if (existing) {
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        existing.pos,
        existing.pos + existing.node.nodeSize,
        dueDateType.create({ date })
      )
    )
    return true
  }

  return appendInline(editor, taskItem, dueDateType.create({ date }))
}
