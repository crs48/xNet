/**
 * DraftReviewRequests — open drafts flagged for review (exploration 0329 P4
 * support), listed on the /requests inbox next to message requests.
 *
 * A draft author (human today; the agent-PR flow later) presses "Request
 * review" in the DraftReviewPanel; the draft appears here for anyone on this
 * device. Clicking opens the HOST node — review happens in the node's own
 * Drafts context tool, not on this page.
 */
import { useNavigate } from '@tanstack/react-router'
import { DRAFT_SCHEMA_IRI, TaskSchema, type NodeState } from '@xnetjs/data'
import { useNodeStore } from '@xnetjs/react'
import { GitBranch } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { navigateToNode } from '../workbench/navigation'
import { NODE_TYPE_BY_SCHEMA } from './desk-cards'

interface ReviewRequest {
  draft: NodeState
  host: NodeState | null
}

function hostLabel(host: NodeState | null): string {
  if (!host) return 'Unknown item'
  const title = host.properties.title ?? host.properties.name
  return typeof title === 'string' && title ? title : 'Untitled'
}

const baseIRI = (schemaId: string): string => schemaId.split('@')[0]

/** Open drafts with `reviewRequested`, hosts resolved, newest first. */
function useDraftReviewRequests(): ReviewRequest[] {
  const { store, isReady } = useNodeStore()
  const [requests, setRequests] = useState<ReviewRequest[]>([])

  const reload = useCallback(async () => {
    if (!store || !isReady) return
    const drafts = (await store.list({ schemaId: DRAFT_SCHEMA_IRI as never }))
      .filter((d) => d.properties.status === 'open' && d.properties.reviewRequested === true)
      .sort((a, b) => b.createdAt - a.createdAt)
    const withHosts = await Promise.all(
      drafts.map(async (draft) => {
        const targetId = draft.properties.target
        const host =
          typeof targetId === 'string' && targetId ? await store.getRaw(targetId as never) : null
        return { draft, host }
      })
    )
    setRequests(withHosts)
  }, [store, isReady])

  useEffect(() => {
    void reload()
    if (!store) return
    // Draft creates carry the schemaId; review-flag updates don't — reload on
    // any change and let the cheap list filter sort it out (inbox scale).
    return store.subscribe(() => void reload())
  }, [store, reload])

  return requests
}

export function DraftReviewRequests() {
  const navigate = useNavigate()
  const requests = useDraftReviewRequests()

  if (requests.length === 0) return null

  const openHost = (host: NodeState) => {
    // Tasks open in the Tasks surface's inline editor; route-family nodes
    // (pages, databases, canvases, …) open their own surface.
    if (baseIRI(host.schemaId) === baseIRI(TaskSchema.schema['@id'])) {
      void navigate({ to: '/tasks', search: { task: host.id } })
      return
    }
    const nodeType = NODE_TYPE_BY_SCHEMA[host.schemaId] ?? NODE_TYPE_BY_SCHEMA[baseIRI(host.schemaId)]
    if (nodeType) navigateToNode(navigate, nodeType, host.id)
  }

  return (
    <section className="flex flex-col gap-3" data-testid="draft-review-requests">
      <header>
        <h2 className="text-base font-semibold">Draft reviews</h2>
        <p className="text-sm text-muted-foreground">
          Drafts waiting for a review. Open one to compare it with main and merge or discard it.
        </p>
      </header>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {requests.map(({ draft, host }) => (
          <li
            key={draft.id}
            className="flex items-center gap-3 rounded-lg border border-border p-3"
          >
            <GitBranch size={18} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {String(draft.properties.name ?? 'Unnamed draft')}
              </div>
              <div className="truncate text-xs text-muted-foreground">on {hostLabel(host)}</div>
            </div>
            <button
              type="button"
              disabled={!host}
              onClick={() => host && openHost(host)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50 disabled:cursor-default disabled:opacity-50"
            >
              Review
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
