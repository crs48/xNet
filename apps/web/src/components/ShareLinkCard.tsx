/**
 * Shared-document card for pasted share links (exploration 0295).
 *
 * Fetches the owner-published preview snapshot (`GET
 * /shares/links/:linkId/preview` — linkId-gated, the fragment secret never
 * leaves the URL) and renders a titled inline card. Clicking opens the
 * share URL itself, so the existing interstitial → claim flow does the
 * rest. When no preview exists (owner opt-out, revoked link, hub down) the
 * card degrades to the plain anchor LinkifiedText would have rendered.
 *
 * Callers must only mount this for the reader's own connected hub —
 * auto-fetching from arbitrary pasted hosts would leak reader IPs.
 */
import {
  FileText,
  Layout,
  LayoutDashboard,
  Presentation,
  Table2,
  Users,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'

export type SharePreview = {
  title: string
  docType: string
  icon: string | null
}

/** Module-level cache: one preview fetch per linkId per session. */
const previewCache = new Map<string, Promise<SharePreview | null>>()

function fetchSharePreview(hubHttpUrl: string, linkId: string): Promise<SharePreview | null> {
  const key = `${hubHttpUrl}|${linkId}`
  const cached = previewCache.get(key)
  if (cached) return cached
  const promise = fetch(`${hubHttpUrl}/shares/links/${encodeURIComponent(linkId)}/preview`, {
    cache: 'no-store'
  })
    .then(async (response) => {
      if (!response.ok) return null
      const data = (await response.json()) as Partial<SharePreview>
      if (typeof data.title !== 'string' || !data.title) return null
      return {
        title: data.title,
        docType: typeof data.docType === 'string' ? data.docType : 'page',
        icon: typeof data.icon === 'string' ? data.icon : null
      }
    })
    .catch(() => null)
  previewCache.set(key, promise)
  return promise
}

/** Test hook: clear the module cache between cases. */
export function clearSharePreviewCache(): void {
  previewCache.clear()
}

const DOC_TYPE_ICONS: Record<string, LucideIcon> = {
  page: FileText,
  database: Table2,
  canvas: Presentation,
  dashboard: LayoutDashboard,
  view: Table2,
  space: Users,
  workspace: Layout
}

const PLAIN_LINK_CLASS = 'text-blue-600 dark:text-blue-400 hover:underline'

export function ShareLinkCard({
  href,
  text,
  linkId,
  hubHttpUrl
}: {
  /** The pasted share URL, verbatim (fragment secret intact). */
  href: string
  /** Visible text (the URL) for the plain-anchor fallback. */
  text: string
  linkId: string
  hubHttpUrl: string
}) {
  const [preview, setPreview] = useState<SharePreview | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchSharePreview(hubHttpUrl, linkId).then((result) => {
      if (cancelled) return
      setPreview(result)
      setResolved(true)
    })
    return () => {
      cancelled = true
    }
  }, [hubHttpUrl, linkId])

  if (!resolved || !preview) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={PLAIN_LINK_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </a>
    )
  }

  const Icon = DOC_TYPE_ICONS[preview.docType] ?? FileText
  const domain = (() => {
    try {
      return new URL(hubHttpUrl).host
    } catch {
      return hubHttpUrl
    }
  })()

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Shared ${preview.docType} on ${domain} — open to claim access`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-72 items-baseline gap-1 rounded-full border border-hairline bg-transparent px-1.5 py-px align-baseline text-ink-2 no-underline transition-colors hover:text-ink-1"
    >
      <Icon size={11} strokeWidth={1.5} className="shrink-0 self-center text-ink-3" />
      <span className="truncate">{preview.title}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
        {preview.docType} · {domain}
      </span>
    </a>
  )
}
