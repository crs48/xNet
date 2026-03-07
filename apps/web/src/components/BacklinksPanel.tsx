/**
 * Backlinks panel component.
 *
 * Shows all pages that link to the current page via wikilinks.
 */
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { usePageSearchSurface } from '../hooks/usePageSearchSurface'

interface Props {
  docId: string
}

export function BacklinksPanel({ docId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { getBacklinks, indexedPages, loading, totalPages } = usePageSearchSurface({
    enabled: expanded
  })
  const backlinks = useMemo(() => getBacklinks(docId), [docId, getBacklinks])

  if (loading) {
    return (
      <div className="mt-8 border border-border rounded-lg overflow-hidden">
        <div className="p-4 bg-secondary">
          <h3 className="text-sm font-semibold">Backlinks</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Indexing pages... {indexedPages}/{totalPages}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8 border border-border rounded-lg overflow-hidden">
      <button
        className="w-full p-3 px-4 bg-secondary border-none cursor-pointer text-left"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <h3 className="text-sm font-semibold text-foreground flex justify-between items-center m-0">
          Backlinks{expanded || backlinks.length > 0 ? ` (${backlinks.length})` : ''}
          <span className="text-lg text-muted-foreground">{expanded ? '−' : '+'}</span>
        </h3>
      </button>

      {expanded && (
        <div className="p-4">
          {backlinks.length === 0 ? (
            <p className="text-sm text-muted-foreground m-0">No pages link to this page yet.</p>
          ) : (
            <ul className="list-none">
              {backlinks.map((link) => (
                <li key={link.docId} className="py-2 border-b border-border last:border-b-0">
                  <Link
                    to="/doc/$docId"
                    params={{ docId: link.docId }}
                    className="block text-foreground no-underline hover:no-underline"
                  >
                    <strong className="block font-medium">{link.title}</strong>
                    {link.context && (
                      <span className="block text-sm text-muted-foreground mt-1">
                        {link.context}
                      </span>
                    )}
                    {link.matchCount > 1 && (
                      <span className="block text-xs text-muted-foreground mt-1">
                        {link.matchCount} matches
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
