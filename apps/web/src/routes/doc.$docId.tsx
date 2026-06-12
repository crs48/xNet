/**
 * Document page route — thin wrapper over PageView.
 */
import { createFileRoute } from '@tanstack/react-router'
import { PageView } from '../components/PageView'

export const Route = createFileRoute('/doc/$docId')({
  component: DocumentPage
})

function DocumentPage() {
  const { docId } = Route.useParams()

  return <PageView docId={docId} />
}
