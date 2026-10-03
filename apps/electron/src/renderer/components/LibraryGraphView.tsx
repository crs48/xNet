import type { GraphControls } from './library-graph/GraphCanvas'
import type {
  LibraryGraph,
  LibraryGraphDetail,
  LibraryGraphNode,
  LibraryGraphRelation
} from '../../shared/library-graph'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GraphCanvas } from './library-graph/GraphCanvas'
import { GraphGroups } from './library-graph/GraphGroups'
import { GraphSearch } from './library-graph/GraphSearch'
import { graphAdjacency, graphColor, relationKinds, selectGraph } from './library-graph/model'
import { groupNames } from './library-graph/navigation'
import { LibraryThumbnail } from './LibraryResourceCard'

const button =
  'rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50'
const count = (value: number) => value.toLocaleString()
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function GraphDetail({
  node,
  neighbors,
  edges,
  pinned,
  onPin,
  onChoose,
  onNeighborhood,
  onOpenResource
}: {
  node: LibraryGraphNode
  neighbors: LibraryGraphNode[]
  edges: LibraryGraph['edges']
  pinned: boolean
  onPin: () => void
  onChoose: (node: LibraryGraphNode) => void
  onNeighborhood: () => void
  onOpenResource: (id: string) => void
}) {
  const [detail, setDetail] = useState<LibraryGraphDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [limit, setLimit] = useState(30)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    let active = true
    setDetail(null)
    setError(null)
    setLimit(30)
    setFilter('')
    if (node.kind !== 'link') return
    // Fast pointer movement should not enqueue a full metadata read for every dot.
    const timer = setTimeout(() => {
      void window.xnet.libraryGraphDetail(node.id).then(
        (value) => {
          if (active) setDetail(value)
        },
        (reason) => {
          if (active) setError(errorText(reason))
        }
      )
    }, 160)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [node.id, node.kind])
  const resource = detail?.resource
  const filtered = neighbors.filter((neighbor) =>
    neighbor.label.toLocaleLowerCase().includes(filter.toLocaleLowerCase())
  )
  const evidence = [...new Set(edges.map((edge) => edge.evidence))]
  return (
    <div className="space-y-4" aria-label="Graph preview">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {pinned ? 'Pinned detail' : 'Hover preview'} · {node.kind}
        </span>
        <button className={button} onClick={onPin}>
          {pinned ? 'Unpin' : 'Pin'}
        </button>
      </div>
      {node.kind === 'link' && (
        <LibraryThumbnail resource={resource ?? { platform: node.platform }} />
      )}
      <div>
        <h2 className="break-words text-base font-semibold leading-snug">
          {resource?.metadata?.title || node.label}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {node.platform}
          {resource?.metadata?.author || resource?.actor
            ? ` · ${resource.metadata?.author || resource.actor}`
            : ''}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {node.kind === 'link' && !detail && !error && (
        <p className="text-xs text-muted-foreground">Loading saved details…</p>
      )}
      {detail && !resource && (
        <p role="status" className="text-sm">
          This source is no longer in the Library. Reload the graph.
        </p>
      )}
      {resource && (
        <>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {resource.metadata?.description || resource.sourceText || 'No description saved yet.'}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <dt>Added to Library</dt>
            <dd>{new Date(resource.addedAt).toLocaleDateString()}</dd>
            <dt>Source privacy</dt>
            <dd>{resource.privacy}</dd>
            {resource.metadata?.durationSeconds !== undefined && (
              <>
                <dt>Duration</dt>
                <dd>{Math.round(resource.metadata.durationSeconds / 60)} min</dd>
              </>
            )}
            {resource.metadata?.language && (
              <>
                <dt>Language</dt>
                <dd>{resource.metadata.language}</dd>
              </>
            )}
            <dt>Transcript</dt>
            <dd>
              {resource.transcript
                ? `${resource.transcript.language} · ${count(resource.transcript.cues.length)} cues`
                : 'Not saved'}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <a href={resource.url} target="_blank" rel="noreferrer" className={button}>
              Open original
            </a>
            <button className={button} onClick={() => onOpenResource(resource.id)}>
              Read in Library
            </button>
          </div>
        </>
      )}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{count(neighbors.length)} connections</h3>
          <button className={button} onClick={onNeighborhood}>
            Isolate neighborhood
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {node.kind === 'creator'
            ? 'Links with this author name on this platform. Matching names are not a verified identity.'
            : 'Connections come from imported memberships, source tags, categories, or matching creator names.'}
          {evidence.includes('hashtag') ? ' Hashtags are read from saved source text.' : ''}
        </p>
        {neighbors.length > 30 && (
          <input
            aria-label="Filter connections"
            placeholder="Filter these connections"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value)
              setLimit(30)
            }}
            className="w-full rounded border border-border bg-background p-2 text-xs"
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          {filtered.slice(0, limit).map((neighbor) => (
            <button
              key={neighbor.id}
              className={`${button} max-w-full truncate text-left`}
              onClick={() => onChoose(neighbor)}
              title={neighbor.label}
            >
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: graphColor(neighbor.kind, neighbor.platform) }}
              />
              {neighbor.label}
            </button>
          ))}
        </div>
        {!neighbors.length && (
          <p className="text-xs text-muted-foreground">
            No known connections with these filters. The link is still included.
          </p>
        )}
        {filtered.length > limit && (
          <button className={button} onClick={() => setLimit(limit + 50)}>
            Show more ({count(filtered.length - limit)} remaining)
          </button>
        )}
      </div>
      {detail && (
        <details
          className="border-t border-border pt-3 text-xs"
          onToggle={(event) => setMetadataOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer font-medium">All saved metadata & provenance</summary>
          <p className="my-2 text-muted-foreground">
            Original imported fields and saved enrichment, including field coverage and caption
            evidence.
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-secondary p-2">
            {metadataOpen ? JSON.stringify(detail, null, 2) : null}
          </pre>
        </details>
      )}
    </div>
  )
}

export function LibraryGraphView({
  onOpenResource,
  onClose
}: {
  onOpenResource: (id: string) => void
  onClose: () => void
}) {
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const root = document.getElementById('root')
    const previousInert = root?.inert ?? false
    const previousFocus = document.activeElement
    if (root) root.inert = true
    searchInput.current?.focus()
    return () => {
      if (root) root.inert = previousInert
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])
  const [showInspector, setShowInspector] = useState(true)
  const [showGroups, setShowGroups] = useState(true)
  const [groups, setGroups] = useState<string[]>([])
  const [match, setMatch] = useState<'any' | 'all'>('any')
  const [graph, setGraph] = useState<LibraryGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [platform, setPlatform] = useState('')
  const [kinds, setKinds] = useState<LibraryGraphRelation[]>(relationKinds)
  const [focus, setFocus] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [pinned, setPinned] = useState(false)
  const [paused, setPaused] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [progress, setProgress] = useState(0)
  const controller = useRef<GraphControls | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setRenderError(null)
    void window.xnet
      .libraryGraph()
      .then((serialized) => {
        if (active) {
          setGraph(JSON.parse(serialized) as LibraryGraph)
          setLoading(false)
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(errorText(reason))
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [revision])
  const visible = useMemo(
    () => (graph ? selectGraph(graph, platform, kinds, focus, groups, match) : null),
    [graph, platform, kinds, focus, groups, match]
  )
  const adjacency = useMemo(() => (visible ? graphAdjacency(visible) : []), [visible])
  const indices = useMemo(() => new Map(visible?.nodes.map((node, i) => [node.id, i])), [visible])
  const previewIndex = previewId ? indices.get(previewId) : undefined
  const preview = previewIndex === undefined ? null : visible!.nodes[previewIndex]
  const groupLabels = useMemo(
    () =>
      new Map(
        graph?.nodes.filter((node) => node.kind !== 'link').map((node) => [node.id, node.label])
      ),
    [graph]
  )
  const hubs = useMemo(
    () =>
      visible?.nodes
        .filter((node) => node.kind !== 'link')
        .sort((a, b) => adjacency[indices.get(b.id)!].length - adjacency[indices.get(a.id)!].length)
        .slice(0, 12) ?? [],
    [visible, adjacency, indices]
  )
  const choose = useCallback(
    (node: LibraryGraphNode) => {
      setPreviewId(node.id)
      setPinned(true)
      setShowInspector(true)
      const index = indices.get(node.id)
      if (index !== undefined) controller.current?.focus(index)
    },
    [indices]
  )
  const resetPreview = () => {
    setPreviewId(null)
    setPinned(false)
    setRenderError(null)
  }
  const toggleGroup = (id: string) => {
    setGroups((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
    setFocus(null)
    resetPreview()
  }
  const clearFilters = () => {
    setGroups([])
    setPlatform('')
    setFocus(null)
    setMatch('any')
    resetPreview()
  }
  const platforms = useMemo(
    () =>
      [
        ...new Set(graph?.nodes.filter((node) => node.kind === 'link').map((node) => node.platform))
      ].sort(),
    [graph]
  )
  return createPortal(
    <section
      className="fixed inset-0 z-[200] flex min-h-0 flex-col bg-background pt-8"
      role="dialog"
      aria-modal="true"
      aria-label="Library 3D graph"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-2">
        <button className={button} onClick={onClose}>
          ← Back to Library
        </button>
        <span className="text-xs font-medium text-muted-foreground">Library · 3D graph</span>
        <button className={button} onClick={() => setShowInspector((value) => !value)}>
          {showInspector ? 'Hide inspector' : 'Show inspector'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <GraphSearch graph={loading ? null : visible} inputRef={searchInput} onChoose={choose} />
        <select
          aria-label="Graph source"
          value={platform}
          onChange={(event) => {
            setPlatform(event.target.value)
            setFocus(null)
            resetPreview()
          }}
          className="rounded-md border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">All sources</option>
          {platforms.map((source) => (
            <option key={source}>{source}</option>
          ))}
        </select>
        <button
          className={button}
          aria-expanded={showGroups}
          onClick={() => setShowGroups((value) => !value)}
        >
          {showGroups ? 'Hide groups' : 'Browse groups'}
          {groups.length ? ` (${groups.length})` : ''}
        </button>
        <button
          className={button}
          disabled={loading}
          onClick={() => {
            resetPreview()
            setRevision((value) => value + 1)
          }}
        >
          Reload graph
        </button>
        {focus && (
          <button
            className={button}
            onClick={() => {
              setFocus(null)
              resetPreview()
            }}
          >
            Leave neighborhood
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2 text-xs">
        <span className="text-muted-foreground">Show connections:</span>
        {relationKinds.map((kind) => (
          <label key={kind} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={kinds.includes(kind)}
              onChange={() => {
                setKinds((current) =>
                  current.includes(kind)
                    ? current.filter((value) => value !== kind)
                    : [...current, kind]
                )
                resetPreview()
              }}
            />
            <span className="h-2 w-2 rounded-full" style={{ background: graphColor(kind, '') }} />
            {groupNames[kind]}
          </label>
        ))}
        <span className="text-muted-foreground">Source relationships · no AI categories yet</span>
      </div>
      {(groups.length > 0 || platform || focus) && (
        <div
          aria-label="Active graph filters"
          className="flex max-h-28 flex-wrap items-center gap-2 overflow-y-auto border-b border-border px-5 py-2 text-xs"
        >
          {groups.length > 0 && (
            <>
              <label className="flex items-center gap-1.5">
                Links matching
                <select
                  aria-label="Match selected groups"
                  value={match}
                  className="rounded border border-border bg-background px-1 py-1"
                  onChange={(event) => {
                    setMatch(event.target.value === 'all' ? 'all' : 'any')
                    setFocus(null)
                    resetPreview()
                  }}
                >
                  <option value="any">any group</option>
                  <option value="all">all groups</option>
                </select>
              </label>
              {groups.map((id) => (
                <button
                  key={id}
                  className={`${button} max-w-60 truncate bg-accent`}
                  aria-label={`Remove group filter ${groupLabels.get(id) ?? 'unavailable group'}`}
                  onClick={() => toggleGroup(id)}
                  title={groupLabels.get(id)}
                >
                  {groupLabels.get(id) ?? 'Unavailable group'} ×
                </button>
              ))}
            </>
          )}
          {platform && <span>Source: {platform}</span>}
          {focus && <span>Within a neighborhood</span>}
          <button className={`${button} ml-auto`} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="px-5 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {graph?.warnings.map((warning) => (
        <p role="alert" key={warning} className="px-5 py-2 text-xs text-amber-600">
          {warning}
        </p>
      ))}
      <div className="flex min-h-0 flex-1">
        {showGroups && graph && (
          <GraphGroups graph={graph} platform={platform} selected={groups} onToggle={toggleGroup} />
        )}
        <div className="relative min-h-64 min-w-0 flex-1 overflow-hidden bg-[#080f1d] text-slate-200">
          {visible && !loading && !renderError && (
            <GraphCanvas
              graph={visible}
              active={previewIndex ?? null}
              paused={paused}
              controller={controller}
              onHover={(index) => {
                if (!pinned) setPreviewId(visible.nodes[index].id)
              }}
              onSelect={(index) => {
                setPreviewId(visible.nodes[index].id)
                setPinned(true)
              }}
              onProgress={setProgress}
              onError={setRenderError}
            />
          )}
          <div className="pointer-events-none absolute left-5 top-4 space-y-1">
            <h2 className="text-sm font-medium tracking-wide">
              {focus
                ? 'A closer look'
                : groups.length || platform
                  ? 'Filtered links'
                  : 'Your link universe'}
            </h2>
            <p role="status" className="text-xs text-slate-400">
              {loading
                ? 'Reading all saved links and relationships…'
                : visible
                  ? `${count(visible.linkCount)} of ${count(graph!.linkCount)} links · ${count(visible.nodes.length - visible.linkCount)} groups · ${count(visible.edges.length)} connections`
                  : 'Graph unavailable'}
            </p>
            {!loading && visible && (
              <p className="text-[11px] text-slate-500">
                {paused
                  ? 'Layout paused'
                  : progress < 1
                    ? `Arranging in 3D · ${Math.round(progress * 100)}%`
                    : 'Layout settled'}
                {focus ? ' · Neighborhood view' : ''}
              </p>
            )}
          </div>
          {renderError && (
            <div
              role="alert"
              className="absolute inset-x-5 top-28 rounded border border-rose-400/40 bg-slate-950 p-4 text-sm"
            >
              {renderError} Search and metadata remain available.
            </div>
          )}
          {!loading && visible?.linkCount === 0 && (
            <p className="absolute inset-x-6 top-32 text-center text-sm text-slate-400">
              No web links match this view. Change the filters or import saved links.
            </p>
          )}
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs hover:bg-slate-800"
              onClick={() => controller.current?.fit()}
            >
              Fit graph
            </button>
            <button
              aria-label="Zoom into graph"
              className="rounded border border-slate-700 bg-slate-950/90 px-3 text-sm"
              onClick={() => controller.current?.zoom(0.7)}
            >
              +
            </button>
            <button
              aria-label="Zoom out of graph"
              className="rounded border border-slate-700 bg-slate-950/90 px-3 text-sm"
              onClick={() => controller.current?.zoom(1.4)}
            >
              −
            </button>
            <button
              className="rounded border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs hover:bg-slate-800"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? 'Resume layout' : 'Pause layout'}
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-16 left-4 text-[11px] text-slate-500">
            Drag to orbit · Scroll to zoom · Right-drag to pan · Click to pin
          </p>
        </div>
        {showInspector && (
          <aside
            className="w-72 shrink-0 space-y-5 overflow-auto border-l border-border bg-background p-4"
            aria-label="Graph inspector"
          >
            {preview && visible && previewIndex !== undefined ? (
              <GraphDetail
                key={preview.id}
                node={preview}
                neighbors={adjacency[previewIndex].map((index) => visible.nodes[index])}
                edges={visible.edges.filter(
                  (edge) => edge.source === previewIndex || edge.target === previewIndex
                )}
                pinned={pinned}
                onPin={() => setPinned((value) => !value)}
                onChoose={choose}
                onNeighborhood={() => {
                  setFocus(preview.id)
                  setPinned(true)
                }}
                onOpenResource={onOpenResource}
              />
            ) : (
              <>
                <div className="space-y-2">
                  <h3 className="text-base font-medium">Follow a connection</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Hover over a dot for its saved thumbnail, description, tags, and metadata. Click
                    to keep the preview open, then isolate its neighborhood.
                  </p>
                </div>
                <div className="space-y-1">
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    Explore a group
                  </h3>
                  {hubs.map((node) => (
                    <button
                      key={node.id}
                      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-accent"
                      onClick={() => {
                        choose(node)
                        setFocus(node.id)
                      }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: graphColor(node.kind, node.platform) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{node.label}</span>
                      <span className="text-muted-foreground">
                        {count(adjacency[indices.get(node.id)!].length)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-xs font-medium">Link colors</h3>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {platforms.map((source) => (
                      <span key={source}>
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full"
                          style={{ background: graphColor('link', source) }}
                        />
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
            {graph && (
              <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                All {count(graph.linkCount)} saved web links are included.{' '}
                {count(graph.resourceCount - graph.linkCount)} local text resources and
                conversations remain in Resources. This view stays on your Mac. Reload to pick up
                new imports and enrichment.
              </p>
            )}
          </aside>
        )}
      </div>
    </section>,
    document.body
  )
}
