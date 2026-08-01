/**
 * apps/web — resolving imported interactions into publishable edges, and
 * remembering what was published (exploration 0420).
 *
 * `@xnetjs/social/publish` deliberately knows nothing about the store: it works
 * on resolved `PublishableEdge` objects so it stays unit-testable on plain
 * data. This file is the join that produces them — an interaction's target URL
 * lives on the linked `SocialContent`, not on the interaction — plus the local
 * `nodeId → at-uri` map that makes republish idempotent.
 */

import type { NodeState, NodeStore } from '@xnetjs/data'
import {
  type PublishableEdge,
  type PublishedEdge,
  PUBLISHABLE_INTERACTION_KINDS
} from '@xnetjs/social/publish'
import { SOCIAL_NAMESPACE } from '@xnetjs/social/schemas'

const INTERACTION_SCHEMA = `${SOCIAL_NAMESPACE}SocialInteraction@1.0.0`

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/**
 * Resolve interactions into publishable edges.
 *
 * Only the kinds a user may ever choose are loaded at all. Reading DMs and
 * follow lists into memory "so the picker can filter them out" is the shape of
 * mistake this feature cannot afford — if they are never resolved, no later bug
 * can offer them.
 */
export async function resolvePublishableEdges(
  store: NodeStore,
  options: { limit?: number } = {}
): Promise<PublishableEdge[]> {
  const publishable = new Set<string>(PUBLISHABLE_INTERACTION_KINDS)
  const interactions = (
    await store.list({ schemaId: INTERACTION_SCHEMA as never, limit: options.limit })
  ).filter((node) => publishable.has(String(node.properties.interactionKind)))

  const targetIds = [
    ...new Set(interactions.map((n) => str(n.properties.target)).filter((id): id is string => !!id))
  ]
  const targets = new Map<string, NodeState>()
  for (const id of targetIds) {
    const node = await store.getRaw(id as never)
    if (node) targets.set(id, node)
  }

  return interactions.map((node) => {
    const target = str(node.properties.target)
    const content = target ? targets.get(target) : undefined
    return {
      nodeId: node.id,
      platform: String(node.properties.platform ?? 'generic') as PublishableEdge['platform'],
      interactionKind: String(
        node.properties.interactionKind ?? 'unknown'
      ) as PublishableEdge['interactionKind'],
      privacyClass: String(
        node.properties.privacyClass ?? 'unknown'
      ) as PublishableEdge['privacyClass'],
      targetUrl:
        str(content?.properties.canonicalUrl) ??
        str(content?.properties.platformUrl) ??
        str(node.properties.value),
      platformContentId: str(content?.properties.platformContentId),
      occurredAt: str(node.properties.observedAt) ?? str(node.properties.publishedAt),
      tags: []
    }
  })
}

// ─── The publish map ─────────────────────────────────────────────────────────

const MAP_KEY = 'xnet.social.publish-map.v1'

/**
 * Where the `nodeId → at-uri` map lives.
 *
 * Local storage, deliberately: the map is a device-local cache of what this
 * device wrote, and `reconcile()` against the repo is what makes losing it
 * safe. Syncing it as nodes would put a growing list of at-uris into every
 * device's change log for no benefit the repo cannot already provide.
 */
export function loadPublishMap(did: string): PublishedEdge[] {
  try {
    const raw = localStorage.getItem(`${MAP_KEY}:${did}`)
    return raw ? (JSON.parse(raw) as PublishedEdge[]) : []
  } catch {
    // A corrupt map must not block publishing: reconcile() will rebuild it from
    // the repo, which is the authoritative side anyway.
    return []
  }
}

export function savePublishMap(did: string, entries: readonly PublishedEdge[]): void {
  try {
    localStorage.setItem(`${MAP_KEY}:${did}`, JSON.stringify(entries))
  } catch {
    // Quota or private-mode failure. Non-fatal, but NOT silent: without the map
    // the next run leans entirely on reconcile(), which is slower and needs the
    // network. The caller surfaces this.
    throw new Error(
      'Could not save the publish record locally. Publishing still worked, but the next ' +
        'run will have to re-read your repo to avoid duplicates.'
    )
  }
}

/**
 * Mark published interactions `public`.
 *
 * The `visibility` column has shipped on `SocialInteraction` since 0152 and
 * meant nothing until now. Setting it here is what lets every other surface —
 * views, lenses, the agent's retrieval profile — tell a published edge from a
 * private one without consulting the map.
 */
export async function markEdgesPublic(
  store: NodeStore,
  nodeIds: readonly string[]
): Promise<void> {
  for (const id of nodeIds) {
    await store.update(id as never, { properties: { visibility: 'public' } })
  }
}
