/**
 * Workspace tags for inline #hashtag pickers (exploration 0169).
 *
 * One hook supplies the picker list (active tags, deduped by name so
 * offline twins collapse on sight), get-or-create by normalized name
 * (autocomplete-first anti-sprawl), and a write-through that sets a
 * node's `tags` relation when the pill set in its document changes.
 */
import type { HashtagSuggestion } from '@xnetjs/editor/react'
import { TagSchema, normalizeTagName } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'

export interface TagEntry {
  id: string
  name: string
  color?: string
  archived?: boolean
}

function toTagEntry(doc: {
  id: string
  name?: string
  color?: string
  archived?: boolean
}): TagEntry {
  return { id: doc.id, name: doc.name ?? '', color: doc.color, archived: doc.archived === true }
}

/** Active tags deduped by name (first creation wins, like the picker). */
export function dedupeTagsByName(tags: TagEntry[]): TagEntry[] {
  const byName = new Map<string, TagEntry>()
  for (const tag of tags) {
    if (tag.archived || !tag.name) continue
    if (!byName.has(tag.name)) byName.set(tag.name, tag)
  }
  return [...byName.values()]
}

export interface WorkspaceTagsApi {
  /** All tags, including archived (for management UI) */
  allTags: TagEntry[]
  /** Picker-facing list: active, deduped by name */
  suggestions: HashtagSuggestion[]
  /** Get-or-create a tag by raw name; null when the name is unusable */
  getOrCreateTag: (raw: string) => Promise<HashtagSuggestion | null>
  /** Write-through for a node's `tags` relation */
  setNodeTags: (nodeId: string, tagIds: string[]) => Promise<void>
}

export function useWorkspaceTags(): WorkspaceTagsApi {
  const { create, mutate } = useMutate()
  // Sort by an indexed system field (not the `name` property, which can't be
  // pushed to SQL and forces a full-schema scan) and bound the read, then sort
  // by name in JS. Keeps the picker fast as the workspace grows (0184).
  const { data: tagDocs } = useQuery(TagSchema, { orderBy: { updatedAt: 'desc' }, limit: 500 })

  const allTags = useMemo(
    () => (tagDocs ?? []).map(toTagEntry).sort((a, b) => a.name.localeCompare(b.name)),
    [tagDocs]
  )
  const active = useMemo(() => dedupeTagsByName(allTags), [allTags])
  const suggestions = useMemo<HashtagSuggestion[]>(
    () => active.map((tag) => ({ id: tag.id, name: tag.name })),
    [active]
  )

  const getOrCreateTag = useCallback(
    async (raw: string): Promise<HashtagSuggestion | null> => {
      const name = normalizeTagName(raw)
      if (!name) return null
      const existing = active.find((tag) => tag.name === name)
      if (existing) return { id: existing.id, name }
      const tag = await create(TagSchema, { name })
      return tag ? { id: tag.id, name } : null
    },
    [active, create]
  )

  const setNodeTags = useCallback(
    async (nodeId: string, tagIds: string[]) => {
      await mutate([{ type: 'update', id: nodeId, data: { tags: tagIds } }])
    },
    [mutate]
  )

  return { allTags, suggestions, getOrCreateTag, setNodeTags }
}
