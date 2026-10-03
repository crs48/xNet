import type {
  LibraryResource,
  LibrarySearchResult,
  LibraryStatus,
  LibraryHelperStatus
} from '../../shared/library'
import { getCommandRegistry } from '@xnetjs/plugins'
import { flushDocumentWrites } from '@xnetjs/react/internal'
import { lazy, Suspense, useEffect, useState } from 'react'
import { LibraryCollections } from './LibraryCollections'
import {
  LibraryResourceCard,
  LibraryThumbnail,
  libraryTimestamp as timestamp
} from './LibraryResourceCard'

const LibraryGraphView = lazy(() =>
  import('./LibraryGraphView').then((module) => ({ default: module.LibraryGraphView }))
)

const button =
  'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50'
const label = (value: string) => value.replaceAll('-', ' ')
const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/^Error: /, '')
    .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
const atTime = (resource: LibraryResource, ms: number) => {
  if ((resource.networkPlatform ?? resource.platform) !== 'youtube') return resource.url
  const url = new URL(resource.url)
  url.searchParams.set('t', `${Math.floor(ms / 1000)}s`)
  return url.href
}

export function LibraryView({
  onOpenGraph,
  onImport,
  onClose,
  onOpenPage
}: {
  onOpenGraph: () => void
  onImport: () => void
  onClose: () => void
  onOpenPage: (id: string) => void
}) {
  const [status, setStatus] = useState<(LibraryStatus & { error: string | null }) | null>(null)
  const [results, setResults] = useState<LibrarySearchResult[]>([])
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<'resources' | 'collections' | 'graph'>('resources')
  const [platform, setPlatform] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedCue, setSelectedCue] = useState<number | null>(null)
  const [cueLimit, setCueLimit] = useState(100)
  const [selected, setSelected] = useState<LibraryResource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showProgress, setShowProgress] = useState(false)
  const [helper, setHelper] = useState<LibraryHelperStatus | null>(null)
  const [installingHelper, setInstallingHelper] = useState(false)
  const [shortcut, setShortcut] = useState<boolean | null>(null)
  useEffect(() => {
    let active = true
    void window.xnet.libraryCaptureShortcut().then(
      (value) => {
        if (active) setShortcut(value.registered)
      },
      (error) => {
        if (active) setError(errorText(error))
      }
    )
    void flushDocumentWrites()
      .then(() => window.xnet.libraryScan())
      .catch((error) => {
        if (active) setError(errorText(error))
      })
    return () => {
      active = false
    }
  }, [])
  const refresh = async () => {
    setStatus(await window.xnet.libraryStatus())
    setHelper(await window.xnet.libraryHelperStatus())
    setResults(await window.xnet.librarySearch({ text: query, platform, offset, limit: 40 }))
  }
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const nextStatus = await window.xnet.libraryStatus()
        const helperState = await window.xnet.libraryHelperStatus()
        const rows =
          section === 'resources'
            ? await window.xnet.librarySearch({ text: query, platform, offset, limit: 40 })
            : []
        if (active) {
          setStatus(nextStatus)
          setHelper(helperState)
          setResults(rows)
        }
      } catch (error) {
        if (active) setError(errorText(error))
      }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [query, platform, offset, section])
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
        if (active) setError(errorText(error))
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
      setError(errorText(error))
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
          {shortcut !== null && (
            <p className="text-xs text-muted-foreground">
              {shortcut
                ? 'Capture a copied link with Command/Ctrl + Shift + L.'
                : 'The capture shortcut is unavailable. Use Save a link.'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className={button}
            onClick={() => void getCommandRegistry().runCommand('library.capture')}
          >
            Save a link
          </button>
          <button className={button} onClick={onImport}>
            Import archive
          </button>
          <button className={button} onClick={onOpenGraph}>
            Data & saved views
          </button>
          <button className={button} onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <nav aria-label="Library sections" className="flex gap-2 border-b border-border px-6 py-3">
        {(['resources', 'collections', 'graph'] as const).map((name) => (
          <button
            key={name}
            className={`${button} ${section === name ? 'bg-accent font-medium' : ''}`}
            aria-pressed={section === name}
            onClick={() => {
              setSection(name)
              setSelectedId(null)
            }}
          >
            {name === 'resources'
              ? 'Resources'
              : name === 'collections'
                ? 'Collections'
                : '3D graph'}
          </button>
        ))}
      </nav>
      {section === 'resources' && (
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
            {[
              'youtube',
              'instagram',
              'tiktok',
              'x',
              'twitter',
              'reddit',
              'github',
              'claude',
              'openai',
              'grok',
              'generic'
            ].map((name) => (
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
      )}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3 text-sm">
        <span>
          {status?.resources.toLocaleString() ?? '…'} resources ·{' '}
          {status?.error
            ? 'Enrichment stopped'
            : status?.paused
              ? 'Enrichment paused'
              : status?.running.length
                ? 'Enriching sources'
                : status?.nextAt !== null
                  ? 'Waiting for next source request'
                  : 'Pass finished — review Coverage & gaps'}
        </span>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void run(() =>
              status?.paused || status?.error
                ? window.xnet.libraryResume()
                : window.xnet.libraryPause()
            )
          }
        >
          {status?.error
            ? 'Retry enrichment'
            : status?.paused
              ? 'Start enrichment'
              : 'Pause enrichment'}
        </button>
        <button className="underline" onClick={() => setShowProgress(!showProgress)}>
          Coverage & gaps
        </button>
      </div>
      {status && (
        <div
          aria-live="polite"
          className="space-y-1 border-b border-border px-6 py-2 text-xs text-muted-foreground"
        >
          <p>
            Metadata: {count('metadata', 'complete').toLocaleString()} complete,{' '}
            {count('metadata', 'partial').toLocaleString()} partial,{' '}
            {(
              count('metadata', 'queued') +
              count('metadata', 'running') +
              count('metadata', 'retry')
            ).toLocaleString()}{' '}
            pending
            {' · '}Thumbnails: {count('thumbnail', 'complete').toLocaleString()}
            {' · '}Captions: {count('transcript', 'complete').toLocaleString()}
          </p>
          {status.running.map((job) => (
            <p key={`${job.resourceId}:${job.capability}`}>
              {label(job.capability)} · {job.title}
            </p>
          ))}
          {!status.paused &&
            !status.running.length &&
            status.nextAt !== null &&
            status.nextAt > Date.now() && (
              <p>
                Next request {new Date(status.nextAt).toLocaleTimeString()}. Provider pacing and
                retry delays are preserved when you restart.
              </p>
            )}
        </div>
      )}
      {(error || status?.error) && (
        <p role="alert" className="px-6 py-3 text-sm text-destructive">
          {error || status?.error}
        </p>
      )}
      {showProgress && (
        <section className="max-h-72 shrink-0 space-y-3 overflow-auto border-b border-border px-6 py-3 text-sm">
          <p>
            Enrichment requests source websites from this Mac. Saved text and images remain
            available offline. YouTube titles, descriptions, thumbnails, and available caption
            tracks are fetched directly, with a helper fallback for inaccessible YouTube captions.
            Instagram and TikTok public posts supply written captions, authors, and thumbnails.
            Available TikTok and web subtitle tracks are saved and indexed. Written captions are
            separate from spoken transcripts. Restricted or unavailable posts are listed below and
            do not stop the remaining videos. Automatic local transcription is not connected yet.
          </p>
          <div className="space-y-2 rounded-md border border-border p-3">
            <p>
              Helper for X/Twitter and YouTube caption fallback:{' '}
              {helper ? label(helper.state) : 'checking…'}
              {helper ? ` · yt-dlp ${helper.version}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              Download the tested helper directly from its official GitHub release (about 38 MB).
              xNet verifies it before use. This does not read browser cookies, download video media,
              or start enrichment. A compatible existing yt-dlp installation can also be used.
            </p>
            {helper?.reason && <p role="alert">{helper.reason}</p>}
            {helper && !['ready', 'unsupported'].includes(helper.state) && (
              <button
                className={button}
                disabled={busy || installingHelper || helper.state === 'installing'}
                onClick={() => {
                  setInstallingHelper(true)
                  void run(() => window.xnet.installLibraryHelper()).finally(() =>
                    setInstallingHelper(false)
                  )
                }}
              >
                {installingHelper || helper.state === 'installing'
                  ? 'Downloading and verifying…'
                  : helper.state === 'damaged'
                    ? 'Repair video helper'
                    : 'Install video helper'}
              </button>
            )}
            {(installingHelper || helper?.state === 'installing') && (
              <button
                className={`${button} ml-2`}
                onClick={() =>
                  void window.xnet
                    .cancelLibraryHelper()
                    .catch((error: unknown) => setError(errorText(error)))
                }
              >
                Cancel download
              </button>
            )}
          </div>
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
      {section === 'graph' ? (
        <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading 3D view…</p>}>
          <LibraryGraphView
            onClose={() => setSection('resources')}
            onOpenResource={(id) => {
              setSection('resources')
              setSelectedId(id)
              setSelectedCue(null)
            }}
          />
        </Suspense>
      ) : (
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto p-6">
            {section === 'collections' ? (
              <LibraryCollections
                onSelectResource={(id) => {
                  setSelectedId(id)
                  setSelectedCue(null)
                }}
              />
            ) : (
              <>
                {!results.length && (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {query
                      ? 'No matching source text yet. Check enrichment coverage for unresolved sources.'
                      : 'Import an archive to begin, then find its links here.'}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
                  {results.map((resource, index) => (
                    <LibraryResourceCard
                      key={`${resource.id}:${index}`}
                      resource={resource}
                      onSelect={() => {
                        setSelectedId(resource.id)
                        setSelectedCue(resource.startMs ?? null)
                      }}
                    />
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
              </>
            )}
          </main>
          {selected && (
            <aside className="w-96 shrink-0 space-y-4 overflow-auto border-l border-border p-5">
              <button className={button} onClick={() => setSelectedId(null)}>
                Close details
              </button>
              <LibraryThumbnail resource={selected} />
              <h2 className="text-lg font-medium">{selected.metadata?.title || selected.title}</h2>
              {/^https?:\/\//.test(selected.url) && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all text-sm underline"
                >
                  Open original source
                </a>
              )}
              {selected.kind && (
                <p className="text-xs text-muted-foreground">Imported text · kept locally</p>
              )}
              {selectedCue !== null && selected.transcript && (
                <section
                  className="rounded-md bg-secondary p-3 text-sm"
                  aria-label="Matching passage"
                >
                  <p className="mb-2 font-medium">Matching passage · {timestamp(selectedCue)}</p>
                  <p>{selected.transcript.cues.find((cue) => cue.startMs === selectedCue)?.text}</p>
                  <a
                    className="mt-2 block underline"
                    href={atTime(selected, selectedCue)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {(selected.networkPlatform ?? selected.platform) === 'youtube'
                      ? `Open video at ${timestamp(selectedCue)}`
                      : 'Open source'}
                  </a>
                </section>
              )}
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
                      {note.pageId && (
                        <button
                          className="text-xs underline"
                          onClick={() => onOpenPage(note.pageId!)}
                        >
                          Open editable note
                        </button>
                      )}
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
                        href={atTime(selected, cue.startMs)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {timestamp(cue.startMs)}
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
      )}
    </div>
  )
}
