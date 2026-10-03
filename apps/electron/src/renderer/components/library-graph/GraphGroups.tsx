import type { LibraryGraph, LibraryGraphRelation } from '../../../shared/library-graph'
import { useDeferredValue, useMemo, useState } from 'react'
import { graphColor } from './model'
import { graphGroups, groupNames, normalizeSearch } from './navigation'

const kinds: LibraryGraphRelation[] = ['category', 'tag', 'collection', 'creator']
const labels = { category: 'Categories', tag: 'Tags', collection: 'Playlists', creator: 'Creators' }

export function GraphGroups({
  graph,
  platform,
  selected,
  onToggle
}: {
  graph: LibraryGraph
  platform: string
  selected: string[]
  onToggle: (id: string) => void
}) {
  const [kind, setKind] = useState<LibraryGraphRelation>('category')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(30)
  const search = useDeferredValue(normalizeSearch(query))
  const groups = useMemo(() => graphGroups(graph, platform), [graph, platform])
  const filtered = useMemo(
    () =>
      groups.filter(
        ({ node }) =>
          node.kind === kind &&
          search.split(/\s+/u).every((term) => normalizeSearch(node.label).includes(term))
      ),
    [groups, kind, search]
  )
  return (
    <aside
      aria-label="Browse graph groups"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-background"
    >
      <div className="space-y-3 p-3">
        <h2 className="text-sm font-semibold">Browse groups</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Choose groups to show their links. Counts reflect the selected source.
        </p>
        <div role="group" aria-label="Group type" className="grid grid-cols-2 gap-1">
          {kinds.map((value) => (
            <button
              key={value}
              aria-pressed={kind === value}
              className={`rounded border px-2 py-1.5 text-xs ${kind === value ? 'border-primary bg-accent font-medium' : 'border-border hover:bg-accent'}`}
              onClick={() => {
                setKind(value)
                setQuery('')
                setLimit(30)
              }}
            >
              {labels[value]}{' '}
              <span className="text-muted-foreground">
                {groups.filter(({ node }) => node.kind === value).length.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <input
          aria-label="Find a graph group"
          placeholder={`Find ${labels[kind].toLowerCase()}…`}
          value={query}
          className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
          onChange={(event) => {
            setQuery(event.target.value)
            setLimit(30)
          }}
        />
      </div>
      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3"
        role="group"
        aria-label={groupNames[kind]}
      >
        {filtered.slice(0, limit).map(({ node, count }) => (
          <label
            key={node.id}
            className="flex cursor-pointer items-start gap-2 rounded px-1 py-2 text-xs hover:bg-accent"
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.includes(node.id)}
              onChange={() => onToggle(node.id)}
              aria-label={`Filter by ${node.label}${node.platform ? ` (${node.platform})` : ''}`}
            />
            <span className="min-w-0 flex-1 break-words">
              <span
                className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: graphColor(kind, '') }}
              />
              {node.label}
              {node.platform && (
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {node.platform}
                </span>
              )}
            </span>
            <span className="text-muted-foreground" aria-label={`${count.toLocaleString()} links`}>
              {count.toLocaleString()}
            </span>
          </label>
        ))}
        {!filtered.length && (
          <p role="status" className="p-2 text-xs leading-relaxed text-muted-foreground">
            {query
              ? 'No groups match these words.'
              : 'No saved groups of this type for this source.'}
          </p>
        )}
        {filtered.length > limit && (
          <button
            className="w-full rounded border border-border px-2 py-2 text-xs hover:bg-accent"
            onClick={() => setLimit((value) => value + 50)}
          >
            Show more ({(filtered.length - limit).toLocaleString()})
          </button>
        )}
      </div>
    </aside>
  )
}
