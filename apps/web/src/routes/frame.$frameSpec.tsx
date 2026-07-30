/**
 * Frame tab route (0346) — `/frame/<viewType>~<nodeId>` opens a node
 * through any registered view.
 */
import { createFileRoute } from '@tanstack/react-router'
import { FrameTabView } from '../components/FrameTabView'

export const Route = createFileRoute('/frame/$frameSpec')({
  component: FramePage
})

function FramePage() {
  const { frameSpec } = Route.useParams()
  return <FrameTabView frameSpec={frameSpec} />
}
