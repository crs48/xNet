/**
 * Backlinks panel component
 *
 * Shows all pages that link to the current page via wikilinks.
 * TODO: Implement proper backlink search using the query engine.
 */
import { useState } from 'react'
import { Link } from '@tanstack/react-router'

interface Backlink {
  docId: string
  title: string
  context: string
}

interface Props {
  docId: string
}

export function BacklinksPanel({ docId }: Props) {
  // TODO: Implement backlink search using NodeStore + query
  // For now, this is a placeholder that shows no backlinks
  const [expanded, setExpanded] = useState(false)
  const backlinks: Backlink[] = []
  const loading = false

  if (loading) {
    return (
      <div className="backlinks-panel loading">
        <h3>Backlinks</h3>
        <p>Searching...</p>
      </div>
    )
  }

  return (
    <div className="backlinks-panel">
      <button className="backlinks-toggle" onClick={() => setExpanded(!expanded)} type="button">
        <h3>
          Backlinks ({backlinks.length})
          <span className={`toggle-icon ${expanded ? 'expanded' : ''}`}>
            {expanded ? '−' : '+'}
          </span>
        </h3>
      </button>

      {expanded && (
        <div className="backlinks-content">
          {backlinks.length === 0 ? (
            <p className="no-backlinks">No pages link to this page yet.</p>
          ) : (
            <ul className="backlinks-list">
              {backlinks.map((link) => (
                <li key={link.docId} className="backlink-item">
                  <Link to="/doc/$docId" params={{ docId: link.docId }} className="backlink-link">
                    <strong className="backlink-title">{link.title}</strong>
                    {link.context && <span className="backlink-context">...{link.context}...</span>}
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
