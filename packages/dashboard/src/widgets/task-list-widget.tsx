/**
 * Task list widget - Compact live task rows with a completion toggle.
 *
 * Edits write back through the canonical Task node (useMutate), so toggling
 * a task here updates every other surface showing it.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { TaskSchema } from '@xnetjs/data'
import { useMutate } from '@xnetjs/react'
import { formatRelativeTime, nodeQuery, stubDescriptor, TASK_SCHEMA_IRI } from './shared'

export interface TaskListWidgetConfig extends Record<string, unknown> {
  showCompleted?: boolean
}

function TaskListWidget({
  config,
  data,
  onOpenNode
}: WidgetProps<TaskListWidgetConfig>): JSX.Element {
  const { update } = useMutate()
  const tasks = data.rows.filter((row) => (config.showCompleted ? true : !row.completed))

  if (!data.loading && tasks.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">No tasks</div>
  }

  return (
    <ul className="h-full overflow-y-auto px-2 py-1" data-canvas-interactive="true">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/50"
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0 accent-primary"
            checked={Boolean(task.completed)}
            onChange={(event) =>
              void update(TaskSchema, task.id, { completed: event.target.checked })
            }
            aria-label={`Complete ${String(task.title ?? 'task')}`}
          />
          <button
            type="button"
            className={`min-w-0 flex-1 truncate text-left ${
              task.completed ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
            onClick={() => onOpenNode?.(task.id, TASK_SCHEMA_IRI)}
          >
            {String(task.title ?? 'Untitled')}
          </button>
          {typeof task.dueDate === 'number' ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(task.dueDate)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export const taskListWidget: WidgetDefinition<TaskListWidgetConfig> = {
  type: 'list.tasks',
  name: 'Task list',
  icon: 'check-square-2',
  description: 'Live list of tasks with completion toggles',
  trustTier: 'first-party',
  defaultSize: { w: 4, h: 4, minW: 3, minH: 2 },
  configFields: [
    { key: 'showCompleted', label: 'Show completed', type: 'checkbox', defaultValue: false }
  ],
  getStubConfig: () => ({
    config: { showCompleted: false },
    query: {
      descriptor: stubDescriptor(
        'My tasks',
        nodeQuery(TASK_SCHEMA_IRI, {
          orderBy: [{ field: 'updatedAt', direction: 'desc' }],
          first: 50
        })
      ),
      refresh: 'live'
    }
  }),
  component: TaskListWidget
}
