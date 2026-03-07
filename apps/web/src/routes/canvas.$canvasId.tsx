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

  return (
    <section
      data-xnet-route-id="canvas-view"
      data-xnet-target-id="canvas-route"
      data-xnet-target-label="Canvas route"
      data-xnet-file-hint="apps/web/src/routes/canvas.$canvasId.tsx"
      data-xnet-document-id={canvasId}
      className="h-full"
    >
      <CanvasView docId={canvasId} />
    </section>
  )
}
