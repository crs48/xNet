/**
 * AI surface route (exploration 0388).
 *
 * `AiChatPanel` — the Bring-Your-Own-Model chat surface from 0174/0192 — was a
 * `kind: 'panel'` entry in the legacy `SURFACES` list. The 0353 unified-nav
 * rewrite kept only `lens | route | node` sections, so every panel surface lost
 * its entry point and the AI surface became unreachable: the bottom island
 * renders the tree unconditionally under unified nav, so `setActiveSurface('ai')`
 * had nothing to open.
 *
 * It comes back as a route rather than a sidebar panel, because the rule this
 * nav is being held to is "every primary row changes the main area" — a
 * BYO-model chat with connector config, budget gauges, and streaming replies
 * wants the main area anyway, not a 260px column.
 *
 * `?q=` seeds the composer so the dock's compact Assistant can hand off the
 * question the user already typed.
 */

import { createFileRoute } from '@tanstack/react-router'
import { AiChatPanel } from '../workbench/views/AiChatPanel'

interface AiSearch {
  q?: string
}

export const Route = createFileRoute('/ai')({
  validateSearch: (search: Record<string, unknown>): AiSearch =>
    typeof search.q === 'string' && search.q ? { q: search.q } : {},
  component: AiPage
})

function AiPage(): React.JSX.Element {
  const { q } = Route.useSearch()
  // The panel fills its container; cap the measure so a wide window doesn't
  // stretch chat lines to an unreadable length.
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <AiChatPanel key={q ?? ''} {...(q ? { initialPrompt: q } : {})} />
    </div>
  )
}
