/**
 * Database view route
 */
import { createFileRoute } from '@tanstack/react-router'
import { DatabaseView } from '../components/DatabaseView'

export const Route = createFileRoute('/db/$dbId')({
  component: DatabasePage
})

function DatabasePage() {
  const { dbId } = Route.useParams()

  return <DatabaseView docId={dbId} />
}
