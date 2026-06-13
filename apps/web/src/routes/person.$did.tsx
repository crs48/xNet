/**
 * Person surface route (exploration 0172): a per-person dashboard — the
 * destination for an @mention. Shows the profile, a one-click DM, and the
 * things this person created / is assigned / shares with you.
 */
import { createFileRoute } from '@tanstack/react-router'
import { PersonView } from '../components/PersonView'

export const Route = createFileRoute('/person/$did')({
  component: PersonPage
})

function PersonPage() {
  const { did } = Route.useParams()
  return <PersonView did={did} />
}
