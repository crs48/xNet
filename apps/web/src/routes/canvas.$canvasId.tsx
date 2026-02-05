/**
 * Canvas view route
 */
import { createFileRoute } from '@tanstack/react-router'
import { CanvasView } from '../components/CanvasView'

export const Route = createFileRoute('/canvas/$canvasId')({
  component: CanvasPage
})

function CanvasPage() {
  const { canvasId } = Route.useParams()

  return <CanvasView docId={canvasId} />
}
