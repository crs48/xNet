/**
 * Pure helpers for the `[[` wikilink typeahead targets (exploration 0170).
 *
 * Pages link by bare node id; every other kind uses the
 * `xnet://<type>/<id>` target convention shared with Explorer
 * drag-drop reference chips (0166), so PageView's wikilink navigation
 * handles both without changes. Recently opened nodes float to the
 * head of the list — the suggestion popup shows the head while the
 * query is still empty.
 */
import type { WikilinkTarget } from '@xnetjs/editor/react'

export interface LinkableDoc {
  id: string
  title?: string
}

export interface LinkableGroup {
  kind: string
  docs: LinkableDoc[] | undefined
}

/** Wikilink mark target for a node of a given kind. */
export function wikilinkHref(kind: string, id: string): string {
  return kind === 'page' ? id : `xnet://${kind}/${id}`
}

/** Flatten kind groups into targets, recents first. */
export function buildLinkTargets(groups: LinkableGroup[], recentIds: string[]): WikilinkTarget[] {
  const rank = new Map(recentIds.map((id, index) => [id, index]))
  const entries = groups.flatMap(({ kind, docs }) =>
    (docs ?? []).map((doc) => ({
      target: {
        href: wikilinkHref(kind, doc.id),
        title: doc.title?.trim() || 'Untitled',
        kind
      },
      order: rank.get(doc.id) ?? Number.MAX_SAFE_INTEGER
    }))
  )
  return entries.sort((a, b) => a.order - b.order).map((entry) => entry.target)
}
