/**
 * Space home route (exploration 0181): a people-container's home — its people,
 * its sub-spaces, and its content. The destination for clicking a Space in the
 * Explorer, and where you invite someone to the whole Space at once.
 */
import { createFileRoute } from '@tanstack/react-router'
import { SpaceHomeView } from '../components/SpaceHomeView'

export const Route = createFileRoute('/space/$spaceId')({
  component: SpacePage
})

function SpacePage() {
  const { spaceId } = Route.useParams()
  return <SpaceHomeView spaceId={spaceId} />
}
