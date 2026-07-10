/**
 * Shared people contracts for task editing surfaces.
 *
 * People are DIDs everywhere in the data layer; display metadata (names)
 * is best-effort and supplied by the host surface (presence, profile
 * nodes, or nothing). These helpers keep label/filter behavior identical
 * across the assignee picker, @mention inputs, and avatar stacks.
 */

export interface TaskPersonOption {
  did: string
  /** Best-effort display name; absent for collaborators known only by DID */
  name?: string
  /** Optional workspace-unique @handle (0172), matched by the mention filter */
  handle?: string
  /** The current user — sorted first and labelled as such */
  isSelf?: boolean
}

/** Compact human label for a person: name if known, else a shortened DID. */
export function taskPersonLabel(person: TaskPersonOption): string {
  if (person.name) return person.name
  const tail = person.did.startsWith('did:key:') ? person.did.slice(8) : person.did
  return tail.length > 10 ? `${tail.slice(0, 10)}…` : tail
}

/** Case-insensitive match on name, @handle, or DID, self first, stable otherwise. */
export function filterTaskPeople(
  people: TaskPersonOption[],
  query: string,
  limit = 6
): TaskPersonOption[] {
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? people.filter(
        (person) =>
          person.did.toLowerCase().includes(needle) ||
          (person.name ?? '').toLowerCase().includes(needle) ||
          (person.handle ?? '').toLowerCase().includes(needle)
      )
    : people
  return [...matches]
    .sort((a, b) => Number(Boolean(b.isSelf)) - Number(Boolean(a.isSelf)))
    .slice(0, limit)
}
