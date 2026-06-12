/**
 * Tasks surface route. `?task=` opens a task's inline editor; `?project=`
 * scopes the surface to one project (linked from the sidebar dashboard).
 */

import { createFileRoute } from '@tanstack/react-router'
import { TasksView } from '../components/TasksView'

export interface TasksSearch {
  task?: string
  project?: string
}

function stringParam(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

export const Route = createFileRoute('/tasks')({
  validateSearch: (search: Record<string, unknown>): TasksSearch => {
    const task = stringParam(search.task)
    const project = stringParam(search.project)
    return { ...(task ? { task } : {}), ...(project ? { project } : {}) }
  },
  component: TasksPage
})

function TasksPage(): JSX.Element {
  const { task, project } = Route.useSearch()
  return <TasksView openTaskId={task ?? null} projectId={project ?? null} />
}
