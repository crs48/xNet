/**
 * Backlinks section for the Right Panel — pages that link to the
 * current page via wikilinks, as a flat monochrome list.
 *
 * Mounted only while the Backlinks section is visible, so the page
 * index is built (and live docs are acquired) on demand.
 */
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { usePageSearchSurface } from '../hooks/usePageSearchSurface'

interface Props {
  docId: string
}

export function BacklinksPanel({ docId }: Props) {
  const { getBacklinks, indexedPages, loading, totalPages } = usePageSearchSurface({
    enabled: true
  })
  const backlinks = useMemo(() => getBacklinks(docId), [docId, getBacklinks])

  if (loading) {
    return (
      <p className="m-0 p-3 text-xs text-ink-3">
        Indexing pages… {indexedPages}/{totalPages}
      </p>
    )
  }

  if (backlinks.length === 0) {
    return <p className="m-0 p-3 text-xs text-ink-3">No pages link to this page yet.</p>
  }

  return (
    <ul className="m-0 list-none p-1.5">
      {backlinks.map((link) => (
        <li key={link.docId}>
          <Link
            to="/doc/$docId"
            params={{ docId: link.docId }}
            className="block rounded-md px-2 py-1.5 no-underline transition-colors hover:bg-surface-2 hover:no-underline"
          >
            <span className="block truncate text-[13px] font-medium text-ink-1">{link.title}</span>
            {link.context && (
              <span className="mt-0.5 block truncate text-xs text-ink-3">{link.context}</span>
            )}
            {link.matchCount > 1 && (
              <span className="mt-0.5 block text-[11px] text-ink-3">{link.matchCount} matches</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
