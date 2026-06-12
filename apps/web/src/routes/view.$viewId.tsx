/**
 * Saved view route — saved views are first-class tabs (0166).
 */
import { createFileRoute } from '@tanstack/react-router'
import { SavedViewTab } from '../components/SavedViewTab'

export const Route = createFileRoute('/view/$viewId')({
  component: SavedViewPage
})

function SavedViewPage() {
  const { viewId } = Route.useParams()

  return <SavedViewTab viewId={viewId} />
}
