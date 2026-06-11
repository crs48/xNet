/**
 * Dashboard surface route.
 */
import { createFileRoute } from '@tanstack/react-router'
import { DashboardView } from '../components/DashboardView'

export const Route = createFileRoute('/dashboard/$dashboardId')({
  component: DashboardPage
})

function DashboardPage() {
  const { dashboardId } = Route.useParams()

  return <DashboardView dashboardId={dashboardId} />
}
