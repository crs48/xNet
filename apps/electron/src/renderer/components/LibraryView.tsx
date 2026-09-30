import type { LibraryResource, LibrarySearchResult, LibraryStatus } from '../../library/types'
import { useEffect, useState } from 'react'

const button =
  'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50'
const label = (value: string) => value.replaceAll('-', ' ')

function Thumbnail({ resource }: { resource: Pick<LibraryResource, 'thumbnail' | 'platform'> }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const cid = resource.thumbnail?.cid
  const contentType = resource.thumbnail?.contentType
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setUrl(null)
    setFailed(false)
    if (cid) {
      void window.xnetBSM
        .getBlob(cid)
        .then((bytes) => {
          if (!active) return
          if (!bytes) {
            setFailed(true)
            return
          }
          objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: contentType }))
          setUrl(objectUrl)
        })
        .catch(() => {
          if (active) setFailed(true)
        })
    }
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cid, contentType])
  return url && !failed ? (
    <img
      src={url}
      alt=""
      className="aspect-video w-full rounded-md object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="flex aspect-video items-center justify-center rounded-md bg-secondary px-4 text-center text-xs text-muted-foreground">
      {resource.platform} · {failed ? 'Saved image could not be read' : 'No saved thumbnail yet'}
    </div>
  )
}

export function LibraryView({
  onOpenGraph,
  onImport,
  onClose
}: {
  onOpenGraph: () => void
  onImport: () => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<(LibraryStatus & { error: string | null }) | null>(null)
  const [results, setResults] = useState<LibrarySearchResult[]>([])
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cueLimit, setCueLimit] = useState(100)
  const [selected, setSelected] = useState<LibraryResource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showProgress, setShowProgress] = useState(false)
  const refresh = async () => {
    setStatus(await window.xnet.libraryStatus())
    setResults(await window.xnet.librarySearch({ text: query, platform, offset, limit: 40 }))
  }
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const nextStatus = await window.xnet.libraryStatus()
        const rows = await window.xnet.librarySearch({ text: query, platform, offset, limit: 40 })
        if (active) {
          setStatus(nextStatus)
          setResults(rows)
        }
      } catch (error) {
        if (active) setError(String(error))
      }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [query, platform, offset])
  useEffect(() => {
    let active = true
    setSelected(null)
    setCueLimit(100)
    const load = async () => {
      if (!selectedId) return
      try {
        const resource = await window.xnet.libraryGet(selectedId)
        if (active) setSelected(resource)
      } catch (error) {
        if (active) setError(String(error))
      }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [selectedId])
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await operation()
      await refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const count = (capability: string, state: string) =>
    status?.counts.find((row) => row.capability === capability && row.state === state)?.count ?? 0
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground">
            Keep what matters. Find it again with context.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={button} onClick={onImport}>
            Import archive
          </button>
          <button className={button} onClick={onOpenGraph}>
            Collections & graph
          </button>
          <button className={button} onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <input
          aria-label="Search library"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOffset(0)
          }}
          placeholder="Search titles, descriptions, URLs, and transcripts"
          className="min-w-64 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          aria-label="Source platform"
          value={platform}
          onChange={(event) => {
            setPlatform(event.target.value)
            setOffset(0)
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All sources</option>
          {['youtube', 'instagram', 'x', 'twitter', 'github', 'generic'].map((name) => (
            <option key={name} value={name}>
              {name === 'generic' ? 'Web links' : name}
            </option>
          ))}
        </select>
        <button
          className={button}
          disabled={busy}
          onClick={() => void run(() => window.xnet.libraryScan())}
        >
          Find imported links
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3 text-sm">
        <span>
          {status?.resources.toLocaleString() ?? '…'} resources ·{' '}
          {status?.paused ? 'Enrichment paused' : 'Enrichment running'}
        </span>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void run(() =>
              status?.paused ? window.xnet.libraryResume() : window.xnet.libraryPause()
            )
          }
        >
          {status?.paused ? 'Start enrichment' : 'Pause enrichment'}
        </button>
        <button className="underline" onClick={() => setShowProgress(!showProgress)}>
          Coverage & gaps
        </button>
      </div>
      {(error || status?.error) && (
        <p role="alert" className="px-6 py-3 text-sm text-destructive">
          {error || status?.error}
        </p>
      )}
      {showProgress && (
        <section className="max-h-72 shrink-0 space-y-3 overflow-auto border-b border-border px-6 py-3 text-sm">
          <p>
            Enrichment requests source websites from this Mac. Saved text and images remain
            available offline. Video descriptions and captions currently need the tested local
            yt-dlp helper. Automatic local transcription is not connected yet.
          </p>
          <div className="flex flex-wrap gap-5">
            {['metadata', 'thumbnail', 'transcript', 'index'].map((capability) => (
              <div key={capability}>
                <strong>{label(capability)}</strong>
                <p>
                  {count(capability, 'complete')} complete · {count(capability, 'partial')} partial
                  · {count(capability, 'queued') + count(capability, 'running')} pending
                </p>
                <p>
                  {count(capability, 'blocked') + count(capability, 'retry')} blocked/retry ·{' '}
                  {count(capability, 'unavailable')} unavailable ·{' '}
                  {count(capability, 'not-applicable')} not applicable
                </p>
              </div>
            ))}
          </div>
          <button
            className={button}
            disabled={busy}
            onClick={() => void run(() => window.xnet.libraryRetry())}
          >
            Retry blocked or partial work
          </button>
          {status?.recent.map((job) => (
            <p
              key={`${job.resourceId}:${job.capability}:${job.version}`}
              className="text-xs text-muted-foreground"
            >
              {job.title} · {job.capability}: {job.reason}
            </p>
          ))}
        </section>
      )}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-6">
          {!results.length && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {query
                ? 'No matching source text yet. Check enrichment coverage for unresolved sources.'
                : 'Import an archive to begin, then find its links here.'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
            {results.map((resource, index) => (
              <button
                key={`${resource.id}:${index}`}
                className="space-y-2 rounded-lg border border-border p-3 text-left hover:bg-accent/40"
                onClick={() => setSelectedId(resource.id)}
              >
                <Thumbnail resource={resource} />
                <p className="text-xs text-muted-foreground">
                  {resource.platform}{' '}
                  {resource.metadata?.author
                    ? `· ${resource.metadata.author}`
                    : resource.actor
                      ? `· ${resource.actor}`
                      : ''}
                </p>
                <h2 className="line-clamp-2 font-medium">
                  {resource.metadata?.title || resource.title}
                </h2>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {resource.snippet ||
                    resource.metadata?.description ||
                    resource.sourceText ||
                    'Waiting for source details.'}
                </p>
                {resource.startMs !== undefined && (
                  <p className="text-xs">
                    Transcript match at {Math.floor(resource.startMs / 60000)}:
                    {String(Math.floor(resource.startMs / 1000) % 60).padStart(2, '0')}
                  </p>
                )}
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-between">
            <button
              className={button}
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 40))}
            >
              Previous
            </button>
            <button
              className={button}
              disabled={results.length < 40}
              onClick={() => setOffset(offset + 40)}
            >
              Next
            </button>
          </div>
        </main>
        {selected && (
          <aside className="w-96 shrink-0 space-y-4 overflow-auto border-l border-border p-5">
            <button className={button} onClick={() => setSelectedId(null)}>
              Close details
            </button>
            <Thumbnail resource={selected} />
            <h2 className="text-lg font-medium">{selected.metadata?.title || selected.title}</h2>
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              className="block break-all text-sm underline"
            >
              Open original source
            </a>
            <p className="whitespace-pre-wrap break-words text-sm">
              {selected.metadata?.description ||
                selected.sourceText ||
                'Source description is still unresolved.'}
            </p>
            {selected.metadata && (
              <p className="text-xs text-muted-foreground">
                Fetched {new Date(selected.metadata.fetchedAt).toLocaleString()} ·{' '}
                {selected.metadata.provider}
              </p>
            )}
            {!!selected.notes?.length && (
              <section className="space-y-3">
                <h3 className="font-medium">Authored notes</h3>
                {selected.notes.map((note) => (
                  <article key={note.id} className="rounded-md bg-secondary p-3">
                    <p className="whitespace-pre-wrap text-sm">{note.text}</p>
                    {note.url && (
                      <a
                        className="text-xs underline"
                        href={note.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Original note{note.author ? ` · ${note.author}` : ''}
                      </a>
                    )}
                  </article>
                ))}
              </section>
            )}
            {selected.transcript && (
              <section>
                <h3 className="font-medium">Transcript · {selected.transcript.language}</h3>
                <p className="text-xs text-muted-foreground">
                  {selected.transcript.autoGenerated
                    ? 'Machine-generated source captions'
                    : 'Source captions'}
                </p>
                {selected.transcript.cues.slice(0, cueLimit).map((cue, index) => (
                  <p key={index} className="mt-2 text-sm">
                    <a
                      className="mr-2 text-muted-foreground underline"
                      href={
                        selected.platform === 'youtube'
                          ? `${selected.url}&t=${Math.floor(cue.startMs / 1000)}s`
                          : selected.url
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {Math.floor(cue.startMs / 60000)}:
                      {String(Math.floor(cue.startMs / 1000) % 60).padStart(2, '0')}
                    </a>
                    {cue.text}
                  </p>
                ))}
                {selected.transcript.cues.length > cueLimit && (
                  <button className={button} onClick={() => setCueLimit(cueLimit + 100)}>
                    Show more transcript
                  </button>
                )}
              </section>
            )}
            <button
              className={button}
              disabled={busy}
              onClick={() => void run(() => window.xnet.libraryRetry(selected.id))}
            >
              Retry missing details
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}
