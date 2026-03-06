import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TaskViewEmbedNodeView } from './TaskViewEmbedNodeView'

export type TaskViewEmbedType = 'list'
export type TaskViewScope = 'current-page' | 'all'
export type TaskViewAssigneeFilter = 'any' | 'me'
export type TaskViewDueDateFilter = 'any' | 'overdue' | 'today' | 'next-7-days' | 'none'
export type TaskViewStatusFilter = 'open' | 'done' | 'all'

export interface TaskViewConfig {
  scope: TaskViewScope
  assignee: TaskViewAssigneeFilter
  dueDate: TaskViewDueDateFilter
  status: TaskViewStatusFilter
  showHierarchy: boolean
}

export interface TaskViewEmbedOptions {
  renderView?: (props: {
    viewType: TaskViewEmbedType
    viewConfig: TaskViewConfig
  }) => React.ReactNode
  HTMLAttributes: Record<string, unknown>
}

const DEFAULT_TASK_VIEW_CONFIG: TaskViewConfig = {
  scope: 'current-page',
  assignee: 'any',
  dueDate: 'any',
  status: 'open',
  showHierarchy: true
}

function parseTaskViewConfig(raw: string | null): TaskViewConfig {
  if (!raw) return DEFAULT_TASK_VIEW_CONFIG

  try {
    const parsed = JSON.parse(raw) as Partial<TaskViewConfig>
    return {
      scope: parsed.scope === 'all' ? 'all' : 'current-page',
      assignee: parsed.assignee === 'me' ? 'me' : 'any',
      dueDate:
        parsed.dueDate === 'overdue' ||
        parsed.dueDate === 'today' ||
        parsed.dueDate === 'next-7-days' ||
        parsed.dueDate === 'none'
          ? parsed.dueDate
          : 'any',
      status: parsed.status === 'all' || parsed.status === 'done' ? parsed.status : 'open',
      showHierarchy: parsed.showHierarchy !== false
    }
  } catch {
    return DEFAULT_TASK_VIEW_CONFIG
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskViewEmbed: {
      setTaskViewEmbed: (options?: {
        viewType?: TaskViewEmbedType
        viewConfig?: Partial<TaskViewConfig>
      }) => ReturnType
      updateTaskViewEmbed: (options: {
        viewType?: TaskViewEmbedType
        viewConfig?: Partial<TaskViewConfig>
      }) => ReturnType
    }
  }
}

export const TaskViewEmbedExtension = Node.create<TaskViewEmbedOptions>({
  name: 'taskViewEmbed',

  addOptions() {
    return {
      renderView: undefined,
      HTMLAttributes: {}
    }
  },

  group: 'block',

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      viewType: { default: 'list' },
      viewConfig: {
        default: DEFAULT_TASK_VIEW_CONFIG,
        parseHTML: (element: HTMLElement) =>
          parseTaskViewConfig(element.getAttribute('data-task-view-config')),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-task-view-config': JSON.stringify(attributes.viewConfig ?? DEFAULT_TASK_VIEW_CONFIG)
        })
      },
      showTitle: { default: true },
      maxHeight: { default: 360 }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-task-view-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-task-view-embed': 'true',
        'data-view-type': HTMLAttributes.viewType,
        'data-type': 'task-view-embed'
      })
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskViewEmbedNodeView)
  },

  addCommands() {
    return {
      setTaskViewEmbed:
        (options = {}) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              viewType: options.viewType ?? 'list',
              viewConfig: {
                ...DEFAULT_TASK_VIEW_CONFIG,
                ...(options.viewConfig ?? {})
              }
            }
          })
        },

      updateTaskViewEmbed:
        (options) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, {
            ...(options.viewType !== undefined && { viewType: options.viewType }),
            ...(options.viewConfig !== undefined && {
              viewConfig: {
                ...DEFAULT_TASK_VIEW_CONFIG,
                ...(options.viewConfig ?? {})
              }
            })
          })
        }
    }
  }
})

export { DEFAULT_TASK_VIEW_CONFIG }
