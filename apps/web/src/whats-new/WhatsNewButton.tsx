/**
 * "What's New" status-bar affordance + panel (exploration 0195).
 *
 * Lives in the StatusBar right cluster. Clicking opens a panel that lazily
 * fetches the public changelog feed and lists recent releases, with new-since
 * markers and a link to the full changelog on the website.
 */
import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { CHANGELOG_PAGE_URL, type ChangelogFeedItem } from './feed'
import { useWhatsNew } from './useWhatsNew'

function EntryCard({ item, isNew }: { item: ChangelogFeedItem; isNew: boolean }) {
  return (
    <article className="border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-ink-3">{item.date}</span>
        {isNew && (
          <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success">
            New
          </span>
        )}
        {item.authors.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            {item.authors.map((c) => (
              <a
                key={c.login}
                href={`https://github.com/${c.login}`}
                target="_blank"
                rel="noopener noreferrer"
                title={c.name ?? c.login}
              >
                <img
                  src={`https://github.com/${c.login}.png?size=32`}
                  alt={c.name ?? c.login}
                  width={16}
                  height={16}
                  loading="lazy"
                  className="rounded-full"
                />
              </a>
            ))}
          </span>
        )}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-ink-1">{item.title}</h3>
      <p className="mb-2 text-xs leading-relaxed text-ink-2">{item.summary}</p>
      {item.image && (
        <img
          src={item.image}
          alt={item.title}
          loading="lazy"
          className="mb-2 w-full rounded-md border border-hairline"
        />
      )}
      {item.highlights.length > 0 && (
        <ul className="grid gap-1">
          {item.highlights.map((h) => (
            <li key={h} className="flex gap-1.5 text-xs text-ink-2">
              <span className="text-success">·</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function WhatsNewPanel({ api }: { api: ReturnType<typeof useWhatsNew> }) {
  const { items, loading, unseen, closePanel } = api
  const unseenIds = new Set(unseen.map((u) => u.id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePanel])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 pt-[10vh]"
      onClick={closePanel}
      role="presentation"
    >
      <div
        className="flex max-h-[70vh] w-[min(92vw,440px)] flex-col overflow-hidden rounded-2xl border border-hairline bg-island-pop shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="What's New"
      >
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-1">
            <Sparkles size={14} strokeWidth={1.5} />
            What's New
          </h2>
          <button
            type="button"
            onClick={closePanel}
            aria-label="Close"
            className="cursor-pointer border-none bg-transparent text-ink-3 hover:text-ink-1"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto">
          {loading && <p className="px-4 py-6 text-center text-xs text-ink-3">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-ink-3">
              No changelog available right now.
            </p>
          )}
          {items.map((item) => (
            <EntryCard key={item.id} item={item} isNew={unseenIds.has(item.id)} />
          ))}
        </div>

        <footer className="border-t border-hairline px-4 py-2 text-center">
          <a
            href={CHANGELOG_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            View full changelog →
          </a>
        </footer>
      </div>
    </div>
  )
}

export function WhatsNewButton() {
  const api = useWhatsNew()
  return (
    <>
      <button
        type="button"
        onClick={api.openPanel}
        title="What's New"
        aria-label="What's New"
        className="flex cursor-pointer items-center border-none bg-transparent p-0 text-ink-3 hover:text-ink-1"
      >
        <Sparkles size={12} strokeWidth={1.5} />
      </button>
      {api.open && <WhatsNewPanel api={api} />}
    </>
  )
}
