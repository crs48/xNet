import { getCommandRegistry } from '@xnetjs/plugins'
import { useEffect, useRef, useState } from 'react'
import { workbenchHost } from './host'
import { useNavigateTo } from './platform'

const blank = () => ({ requestId: crypto.randomUUID(), url: '', title: '', note: '', excerpt: '' })
const DRAFT_KEY = 'xnet.library.capture-draft.v1'
const inputClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

/** Shared form; the host supplies a durable local save implementation. */
export function LibraryCaptureHost() {
  const navigate = useNavigateTo()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<{
    id: string
    title: string
    notes: { pageId: string; title: string }[]
  } | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const host = workbenchHost().library
  const show = (url?: string) => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setError(null)
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !['requestId', 'url', 'title', 'note', 'excerpt'].every(
            (key) => typeof (parsed as Record<string, unknown>)[key] === 'string'
          )
        )
          throw new Error(
            'The saved capture draft could not be read. It has been kept in browser storage.'
          )
        const value = parsed as ReturnType<typeof blank> & { attempted?: boolean }
        setDraft({
          requestId: value.requestId,
          url: value.url,
          title: value.title,
          note: value.note,
          excerpt: value.excerpt
        })
        setLocked(value.attempted === true)
      } else {
        setDraft({ ...blank(), url: url ?? '' })
        setLocked(false)
      }
    } catch (error) {
      setError(String(error))
    }
    setOpen(true)
  }
  useEffect(() => {
    if (!host) return
    const command = getCommandRegistry().register({
      id: 'library.capture',
      title: 'Save a link to Library',
      run: () => show()
    })
    const receive = (event: Event) => show((event as CustomEvent<{ url?: string }>).detail?.url)
    window.addEventListener('xnet:open-library-capture', receive)
    return () => {
      command.dispose()
      window.removeEventListener('xnet:open-library-capture', receive)
    }
  }, [host])
  useEffect(() => {
    if (open) linkInput.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open || !host || !/^https?:\/\//i.test(draft.url.trim())) {
      setExisting(null)
      return
    }
    let active = true
    const timer = setTimeout(() => {
      void host.lookup(draft.url).then(
        (value) => {
          if (active) setExisting(value)
        },
        (error) => {
          if (active) setError(String(error))
        }
      )
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [open, draft.url, host])
  const update = (field: 'url' | 'title' | 'note' | 'excerpt', value: string) => {
    if (locked) return
    const next = { ...draft, [field]: value }
    setDraft(next)
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch (error) {
      setError(`This draft could not be kept across a restart: ${String(error)}`)
    }
  }
  const close = () => {
    if (busy) return
    setOpen(false)
    previousFocus.current?.focus()
    host?.closed?.()
  }
  const submit = async () => {
    if (!host || busy) return
    setBusy(true)
    setError(null)
    try {
      const url = new URL(draft.url.trim())
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Use an HTTP or HTTPS URL without embedded credentials.')
      // Freeze the retry payload until the native writer acknowledges it.
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, attempted: true }))
      setLocked(true)
      await host.capture(draft)
      localStorage.removeItem(DRAFT_KEY)
      setDraft(blank())
      setLocked(false)
      setOpen(false)
      previousFocus.current?.focus()
      host.closed?.()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  if (!open || !host) return null
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <form
        ref={form}
        role="dialog"
        aria-modal="true"
        aria-label="Save a link"
        className="max-h-[90vh] w-[520px] space-y-4 overflow-auto rounded-xl border border-border bg-background p-6 shadow-xl"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const inputs = Array.from(
            form.current?.querySelectorAll<HTMLElement>(
              'input:not(:disabled), textarea:not(:disabled), button:not(:disabled)'
            ) ?? []
          )
          const first = inputs[0],
            last = inputs.at(-1)
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <h2 className="text-lg font-semibold">Save a link</h2>
        <p className="text-sm text-muted-foreground">
          Keep the source and your own note. Saving works offline.
        </p>
        <label className="block space-y-1 text-sm">
          URL
          <input
            ref={linkInput}
            className={inputClass}
            type="url"
            required
            maxLength={500}
            value={draft.url}
            disabled={busy || locked}
            onChange={(event) => update('url', event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Title <span className="text-muted-foreground">(optional)</span>
          <input
            className={inputClass}
            maxLength={500}
            value={draft.title}
            disabled={busy || locked}
            onChange={(event) => update('title', event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Why I saved this
          <textarea
            className={inputClass}
            rows={4}
            maxLength={100000}
            value={draft.note}
            disabled={busy || locked}
            onChange={(event) => update('note', event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Excerpt <span className="text-muted-foreground">(optional)</span>
          <textarea
            className={inputClass}
            rows={2}
            maxLength={20000}
            value={draft.excerpt}
            disabled={busy || locked}
            onChange={(event) => update('excerpt', event.target.value)}
          />
        </label>
        {existing && (
          <div className="rounded-md bg-secondary p-3 text-sm">
            <p>Already in Library: {existing.title}. Saving adds a separate note to this source.</p>
            {existing.notes.map((note) => (
              <button
                key={note.pageId}
                type="button"
                className="mt-2 block underline"
                onClick={() => {
                  setOpen(false)
                  host.closed?.(false)
                  navigate({ kind: 'node', nodeType: 'page', nodeId: note.pageId })
                }}
              >
                Open existing note: {note.title}
              </button>
            ))}
          </div>
        )}
        {locked && !busy && (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>This save keeps its original text for a safe retry.</p>
            <button
              type="button"
              className="underline"
              onClick={() => {
                const next = { ...draft, requestId: crypto.randomUUID() }
                try {
                  localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
                  setDraft(next)
                  setLocked(false)
                  setError(null)
                } catch (error) {
                  setError(`The original draft was kept: ${String(error)}`)
                }
              }}
            >
              Edit as a separate capture
            </button>
            <p>The earlier attempt may already be saved. A separate capture creates a new note.</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm"
            disabled={busy}
            onClick={close}
          >
            Keep draft & close
          </button>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            disabled={busy || !draft.url.trim()}
          >
            {busy ? 'Saving locally…' : existing ? 'Save a new note' : 'Save link & note'}
          </button>
        </div>
      </form>
    </div>
  )
}
