import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Node, mergeAttributes } from '@tiptap/core'

function normalizeDateString(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const normalized = new Date(year, month - 1, day)

  if (
    normalized.getFullYear() !== year ||
    normalized.getMonth() !== month - 1 ||
    normalized.getDate() !== day
  ) {
    return null
  }

  return value
}

function isTaskNodeName(name: string): boolean {
  return name === 'taskItem' || name === 'taskList'
}

function findCurrentTaskItem(editor: Editor): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'taskItem') continue

    return {
      node: $from.node(depth),
      pos: depth > 0 ? $from.before(depth) : 0
    }
  }

  return null
}

function findDueDateNode(
  taskNode: ProseMirrorNode,
  taskPos: number
): {
  node: ProseMirrorNode
  pos: number
} | null {
  let match: { node: ProseMirrorNode; pos: number } | null = null

  const visit = (node: ProseMirrorNode, pos: number): void => {
    node.forEach((child, offset) => {
      if (match) return

      const childPos = pos + offset + 1
      if (isTaskNodeName(child.type.name)) return

      if (child.type.name === 'taskDueDate') {
        match = { node: child, pos: childPos }
        return
      }

      visit(child, childPos)
    })
  }

  visit(taskNode, taskPos)
  return match
}

function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatTaskDueDateLabel(value: string): string {
  const normalized = normalizeDateString(value)
  if (!normalized) return 'Due date'

  const [year, month, day] = normalized.split('-').map(Number)
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(new Date().getFullYear() !== year ? { year: 'numeric' } : {})
  })

  return `Due ${formatter.format(new Date(year, month - 1, day))}`
}

export function getCurrentTaskDueDate(editor: Editor): string | null {
  const currentTask = findCurrentTaskItem(editor)
  if (!currentTask) return null

  const currentDueDate = findDueDateNode(currentTask.node, currentTask.pos)
  if (!currentDueDate) return null

  return typeof currentDueDate.node.attrs.date === 'string' ? currentDueDate.node.attrs.date : null
}

export interface TaskDueDateOptions {
  HTMLAttributes: Record<string, string>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskDueDate: {
      setTaskDueDate: (date: string) => ReturnType
      clearTaskDueDate: () => ReturnType
    }
  }
}

export const TaskDueDateExtension = Node.create<TaskDueDateOptions>({
  name: 'taskDueDate',

  inline: true,

  group: 'inline',

  atom: true,

  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      date: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'time[data-task-due-date]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const date = typeof HTMLAttributes.date === 'string' ? HTMLAttributes.date : null
    const normalized = date ? normalizeDateString(date) : null
    const overdue = normalized !== null && normalized < getTodayDateString()

    return [
      'time',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-task-due-date': '',
        datetime: normalized,
        ...(overdue ? { 'data-overdue': 'true' } : {}),
        class: 'task-due-date'
      }),
      normalized ? formatTaskDueDateLabel(normalized) : 'Due date'
    ]
  },

  addCommands() {
    return {
      setTaskDueDate:
        (date: string) =>
        ({ editor, state, dispatch }) => {
          const normalized = normalizeDateString(date)
          if (!normalized) return false

          const dueDateNode = this.type.create({ date: normalized })
          const currentTask = findCurrentTaskItem(editor)
          const existing = currentTask ? findDueDateNode(currentTask.node, currentTask.pos) : null
          let tr = state.tr

          if (existing) {
            tr = tr.replaceWith(existing.pos, existing.pos + existing.node.nodeSize, dueDateNode)
          } else {
            tr = tr.replaceSelectionWith(dueDateNode, false)
          }

          dispatch?.(tr.scrollIntoView())
          return true
        },
      clearTaskDueDate:
        () =>
        ({ editor, state, dispatch }) => {
          const currentTask = findCurrentTaskItem(editor)
          const existing = currentTask ? findDueDateNode(currentTask.node, currentTask.pos) : null
          if (!existing) return false

          dispatch?.(
            state.tr.delete(existing.pos, existing.pos + existing.node.nodeSize).scrollIntoView()
          )
          return true
        }
    }
  }
})
