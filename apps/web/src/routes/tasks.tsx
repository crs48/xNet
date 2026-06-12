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

export const Route = createFileRoute('/tasks')({
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    ...(typeof search.task === 'string' && search.task ? { task: search.task } : {}),
    ...(typeof search.project === 'string' && search.project ? { project: search.project } : {})
  }),
  component: TasksPage
})

function TasksPage(): JSX.Element {
  const { task, project } = Route.useSearch()
  return <TasksView openTaskId={task ?? null} projectId={project ?? null} />
}
