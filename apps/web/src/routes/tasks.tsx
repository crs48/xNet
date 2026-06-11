/**
 * Tasks surface route.
 */

import { createFileRoute } from '@tanstack/react-router'
import { TasksView } from '../components/TasksView'

export const Route = createFileRoute('/tasks')({
  component: TasksPage
})

function TasksPage(): JSX.Element {
  return <TasksView />
}
