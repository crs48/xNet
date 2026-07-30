/**
 * CRM surface route (exploration 0188).
 *
 * Its views (contacts, pipeline, forecast, …) are addressed by the
 * `view` search param rather than local tab state (0353): they are
 * lenses over one route — linkable, palette-reachable, and no longer a
 * second tab system hiding inside a surface.
 */

import { createFileRoute } from '@tanstack/react-router'
import { CrmView } from '../components/crm/CrmView'

export const Route = createFileRoute('/crm')({
  validateSearch: (search: Record<string, unknown>): { view?: string } => ({
    view: typeof search.view === 'string' ? search.view : undefined
  }),
  component: CrmRoute
})

function CrmRoute() {
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <CrmView
      view={view}
      onViewChange={(next) => void navigate({ search: { view: next }, replace: true })}
    />
  )
}
