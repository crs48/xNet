/**
 * Lab surface route (exploration 0180).
 */
import { createFileRoute } from '@tanstack/react-router'
import { LabView } from '../components/LabView'

export const Route = createFileRoute('/lab/$labId')({
  component: LabPage
})

function LabPage() {
  const { labId } = Route.useParams()

  return <LabView labId={labId} />
}
