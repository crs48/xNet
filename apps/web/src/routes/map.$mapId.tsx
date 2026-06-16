/**
 * Map view route (exploration 0187)
 */
import { createFileRoute } from '@tanstack/react-router'
import { MapView } from '../components/MapView'

export const Route = createFileRoute('/map/$mapId')({
  component: MapPage
})

function MapPage() {
  const { mapId } = Route.useParams()

  return <MapView mapId={mapId} />
}
