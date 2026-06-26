import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { wrappingInputRule, type Editor } from '@tiptap/core'
import TaskItem from '@tiptap/extension-task-item'

export interface PageTaskReferenceSnapshot {
  url: string
  provider: string | null
  kind: string | null
  refId: string | null
  title: string | null
  subtitle: string | null
  icon: string | null
  embedUrl: string | null
  metadata: string
}

export interface PageTaskSnapshot {
  taskId: string
  blockId: string
  title: string
  completed: boolean
  parentTaskId: string | null
  sortKey: string
  assignees: string[]
  dueDate: string | null
  references: PageTaskReferenceSnapshot[]
}

type TaskAttrUpdate = {
  pos: number
  attrs: Record<string, unknown>
}

export const PageTaskItemExtension = TaskItem.extend({
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      wrappingInputRule({
        find: /^\s*[-+*]\s+\[([ xX])\]\s$/,
        type: this.type,
        getAttributes: (match) => ({
          checked: match[1]?.toLowerCase() === 'x'
        })
      })
    ]
  },

  addAttributes() {
    const parent = this.parent?.() ?? {}

    return {
      ...parent,
      taskId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-task-id'),
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.taskId === 'string' && attributes.taskId.length > 0
            ? { 'data-task-id': attributes.taskId }
            : {}
      },
      blockId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id'),
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.blockId === 'string' && attributes.blockId.length > 0
            ? { 'data-block-id': attributes.blockId }
            : {}
      }
    }
  }
})

function generateId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function buildSortKey(path: number[]): string {
  return path.map((segment) => String(segment).padStart(4, '0')).join('.')
}

function readSmartReference(node: ProseMirrorNode): PageTaskReferenceSnapshot | null {
  if (node.type.name !== 'smartReference') return null

  return {
    url: toStringValue(node.attrs.url) ?? '',
    provider: toStringValue(node.attrs.provider),
    kind: toStringValue(node.attrs.kind),
    refId: toStringValue(node.attrs.refId),
    title: toStringValue(node.attrs.title),
    subtitle: toStringValue(node.attrs.subtitle),
    icon: toStringValue(node.attrs.icon),
    embedUrl: toStringValue(node.attrs.embedUrl),
    metadata: toStringValue(node.attrs.metadata) ?? '{}'
  }
}

function extractTaskBody(taskNode: ProseMirrorNode): {
  title: string
  assignees: string[]
  dueDate: string | null
  references: PageTaskReferenceSnapshot[]
} {
  const textParts: string[] = []
  const assignees: string[] = []
  const references: PageTaskReferenceSnapshot[] = []
  let dueDate: string | null = null

  const visit = (node: ProseMirrorNode): void => {
    node.forEach((child) => {
      if (child.type.name === 'taskList' || child.type.name === 'taskItem') {
        return
      }

      if (child.type.name === 'taskMention') {
        const mentionId = toStringValue(child.attrs.id)
        if (mentionId && !assignees.includes(mentionId)) {
          assignees.push(mentionId)
        }
        return
      }

      if (child.type.name === 'taskDueDate') {
        const nextDueDate = toStringValue(child.attrs.date)
        if (nextDueDate) {
          dueDate = nextDueDate
        }
        return
      }

      const reference = readSmartReference(child)
      if (reference) {
        references.push(reference)
        return
      }

      if (child.isText && child.text) {
        textParts.push(child.text)
        return
      }

      visit(child)
    })
  }

  visit(taskNode)

  const title =
    textParts.join(' ').replace(/\s+/g, ' ').trim() ||
    references
      .map((reference) => reference.title ?? reference.refId ?? reference.url)
      .join(' ')
      .trim() ||
    'Untitled task'

  return { title, assignees, dueDate, references }
}

function collectPageTasksFromNode(
  node: ProseMirrorNode,
  pos: number,
  parentTaskId: string | null,
  parentPath: number[],
  tasks: PageTaskSnapshot[],
  attrUpdates: TaskAttrUpdate[]
): void {
  let taskIndex = 0

  node.forEach((child, offset) => {
    const childPos = pos + offset + (node.type.name === 'doc' ? 0 : 1)

    if (child.type.name === 'taskItem') {
      const taskId = toStringValue(child.attrs.taskId) ?? generateId('task')
      const blockId = toStringValue(child.attrs.blockId) ?? generateId('block')
      const path = [...parentPath, taskIndex]
      taskIndex += 1

      // `checked` can arrive as a string (e.g. "false" from raw Yjs/HTML); a
      // non-empty string is truthy, so an unchecked task would read as done and
      // its checkbox render filled. Coerce to a real boolean and normalise the
      // node so the checkbox and completion state stay in sync.
      const rawChecked = child.attrs.checked
      const checked = rawChecked === true || rawChecked === 'true'
      const checkedNeedsFix = typeof rawChecked !== 'boolean'

      if (taskId !== child.attrs.taskId || blockId !== child.attrs.blockId || checkedNeedsFix) {
        attrUpdates.push({
          pos: childPos,
          attrs: {
            ...child.attrs,
            taskId,
            blockId,
            checked
          }
        })
      }

      const { title, assignees, dueDate, references } = extractTaskBody(child)

      tasks.push({
        taskId,
        blockId,
        title,
        completed: checked,
        parentTaskId,
        sortKey: buildSortKey(path),
        assignees,
        dueDate,
        references
      })

      collectPageTasksFromNode(child, childPos, taskId, path, tasks, attrUpdates)
      return
    }

    collectPageTasksFromNode(child, childPos, parentTaskId, parentPath, tasks, attrUpdates)
  })
}

export function collectPageTasks(doc: ProseMirrorNode): {
  tasks: PageTaskSnapshot[]
  attrUpdates: TaskAttrUpdate[]
} {
  const tasks: PageTaskSnapshot[] = []
  const attrUpdates: TaskAttrUpdate[] = []

  collectPageTasksFromNode(doc, 0, null, [], tasks, attrUpdates)

  return { tasks, attrUpdates }
}

export function ensurePageTaskAttrs(editor: Editor): boolean {
  const { attrUpdates } = collectPageTasks(editor.state.doc)
  if (attrUpdates.length === 0) return false

  let tr = editor.state.tr

  for (const update of attrUpdates) {
    tr = tr.setNodeMarkup(update.pos, undefined, update.attrs)
  }

  if (!tr.docChanged) return false

  editor.view.dispatch(tr)
  return true
}

export function getPageTasksSnapshot(editor: Editor): PageTaskSnapshot[] {
  return collectPageTasks(editor.state.doc).tasks
}
