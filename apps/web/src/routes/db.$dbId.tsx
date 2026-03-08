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

  return (
    <section
      data-xnet-route-id="database-view"
      data-xnet-target-id="database-route"
      data-xnet-target-label="Database route"
      data-xnet-file-hint="apps/web/src/routes/db.$dbId.tsx"
      data-xnet-document-id={dbId}
      className="h-full"
    >
      <DatabaseView docId={dbId} />
    </section>
  )
}
