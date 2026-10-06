import type { LibrarySearchResult } from '../../shared/library'
import { useQuery } from '@xnetjs/react'
import { SocialCollectionItemSchema, SocialCollectionSchema } from '@xnetjs/social/schemas'
import { useEffect, useState } from 'react'
import { LibraryResourceCard } from './LibraryResourceCard'

const PAGE_SIZE = 40
const button =
  'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50'

function Pagination({
  offset,
  hasMore,
  loading,
  onOffset
}: {
  offset: number
  hasMore: boolean
  loading: boolean
  onOffset: (value: number) => void
}) {
  return (
    <div className="mt-5 flex justify-between">
      <button
        className={button}
        disabled={loading || offset === 0}
        onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}
      >
        Previous page
      </button>
      <button
        className={button}
        disabled={loading || !hasMore}
        onClick={() => onOffset(offset + PAGE_SIZE)}
      >
        Next page
      </button>
    </div>
  )
}

export function LibraryCollections({
  onSelectResource
}: {
  onSelectResource: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null)
  const collections = useQuery(SocialCollectionSchema, {
    search: query.trim() || undefined,
    orderBy: { title: 'asc' },
    page: { first: PAGE_SIZE, count: 'exact' },
    offset,
    source: 'local',
    enabled: selected === null
  })
  if (selected)
    return (
      <CollectionMembers
        key={selected.id}
        collection={selected}
        onBack={() => setSelected(null)}
        onSelectResource={onSelectResource}
      />
    )
  return (
    <section aria-label="Imported collections" className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Your collections</h2>
        <p className="text-sm text-muted-foreground">
          Playlists and saved groups from your imports. Their entries stay connected to the original
          sources.
        </p>
      </div>
      <input
        aria-label="Search collections"
        placeholder="Search collection names"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOffset(0)
        }}
      />
      {collections.error && (
        <p role="alert" className="text-sm text-destructive">
          {collections.error.message}
        </p>
      )}
      {collections.loading && <p className="text-sm text-muted-foreground">Loading collections…</p>}
      {!collections.loading && !collections.error && !collections.data.length && (
        <p className="py-8 text-sm text-muted-foreground">
          {query
            ? 'No matching collections.'
            : 'No imported collections yet. Import an archive that includes playlists or saved groups.'}
        </p>
      )}
      {collections.completeness?.level === 'partial' &&
        collections.completeness.reason !== 'page-limited' && (
          <p role="status" className="text-sm text-muted-foreground">
            Only part of the collection list is available:{' '}
            {collections.completeness.reason ?? 'incomplete query'}.
          </p>
        )}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {collections.data.map((collection) => (
          <button
            key={collection.id}
            className="space-y-2 rounded-lg border border-border p-4 text-left hover:bg-accent/40"
            onClick={() =>
              setSelected({ id: collection.id, title: collection.title || 'Untitled collection' })
            }
          >
            <p className="text-xs text-muted-foreground">
              {collection.platform} ·{' '}
              {(collection.collectionKind || 'unknown').replaceAll('-', ' ')}
            </p>
            <h3 className="font-medium">{collection.title || 'Untitled collection'}</h3>
            {collection.itemCount !== undefined && (
              <p className="text-xs text-muted-foreground">
                {collection.itemCount.toLocaleString()} entries reported by the source
              </p>
            )}
          </button>
        ))}
      </div>
      <Pagination
        offset={offset}
        hasMore={collections.hasMore}
        loading={collections.isFetching}
        onOffset={setOffset}
      />
    </section>
  )
}

function CollectionMembers({
  collection,
  onBack,
  onSelectResource
}: {
  collection: { id: string; title: string }
  onBack: () => void
  onSelectResource: (id: string) => void
}) {
  const [offset, setOffset] = useState(0)
  const [cards, setCards] = useState(new Map<string, LibrarySearchResult | null>())
  const [loadingCards, setLoadingCards] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const members = useQuery(SocialCollectionItemSchema, {
    where: { collection: collection.id },
    // A single sort field keeps archive order authoritative across query normalization.
    orderBy: { sortKey: 'asc' },
    page: { first: PAGE_SIZE, count: 'exact' },
    offset,
    source: 'local'
  })
  const idsKey = JSON.stringify([
    ...new Set(
      members.data
        .map((member) => member.item)
        .filter((id) => typeof id === 'string' && id.length > 0)
    )
  ])
  useEffect(() => {
    let active = true
    let request = 0
    const ids = JSON.parse(idsKey) as string[]
    setCards(new Map())
    setLoadingCards(true)
    setError(null)
    const load = async () => {
      const current = ++request
      try {
        const next = await window.xnet.libraryCards(ids)
        if (active && request === current) {
          setCards(new Map(ids.map((id, index) => [id, next[index]])))
          setError(null)
        }
      } catch (cause) {
        if (active && request === current)
          setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (active && request === current) setLoadingCards(false)
      }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [idsKey])
  return (
    <section aria-label="Collection entries" className="space-y-4">
      <button className={button} onClick={onBack}>
        Back to collections
      </button>
      <div>
        <h2 className="text-lg font-medium">{collection.title}</h2>
        <p className="text-sm text-muted-foreground">
          {members.totalCount === null
            ? 'Saved entries'
            : `${members.totalCount.toLocaleString()} saved entries`}
          . Repeated saves remain separate. Order follows the export when available.
        </p>
      </div>
      {(members.error || error) && (
        <p role="alert" className="text-sm text-destructive">
          {members.error?.message || error}
        </p>
      )}
      {(members.loading || loadingCards) && (
        <p className="text-sm text-muted-foreground">Loading saved entries…</p>
      )}
      {members.completeness?.level === 'partial' &&
        members.completeness.reason !== 'page-limited' && (
          <p role="status" className="text-sm text-muted-foreground">
            Some entries could not be loaded: {members.completeness.reason ?? 'incomplete query'}.
          </p>
        )}
      {!members.loading && !members.error && !members.data.length && (
        <p className="py-8 text-sm text-muted-foreground">
          No membership records are available in this local view.
        </p>
      )}
      {!members.loading && !loadingCards && !error && !members.error && (
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {members.data.map((member, index) => {
            const resource = member.item ? cards.get(member.item) : null
            return resource ? (
              <LibraryResourceCard
                key={member.id}
                resource={resource}
                caption={`Entry ${offset + index + 1}`}
                onSelect={() => onSelectResource(resource.id)}
              />
            ) : (
              <article key={member.id} className="space-y-2 rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Entry {offset + index + 1}</p>
                <h3 className="font-medium">Source details unavailable</h3>
                <p className="text-sm text-muted-foreground">
                  This entry is not indexed as a Library resource. In Resources, choose Find
                  imported links, or inspect it in Graph & saved views.
                </p>
              </article>
            )
          })}
        </div>
      )}
      <Pagination
        offset={offset}
        hasMore={members.hasMore}
        loading={members.isFetching}
        onOffset={setOffset}
      />
    </section>
  )
}
