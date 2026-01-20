/**
 * Backlinks panel component
 *
 * Shows all pages that link to the current page via wikilinks.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { useXNet } from '@xnet/react'

interface Backlink {
  docId: string
  title: string
  context: string
}

interface Props {
  docId: string
}

export function BacklinksPanel({ docId }: Props) {
  const { store } = useXNet()
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // Search for backlinks to this document
  const searchBacklinks = useCallback(async () => {
    setLoading(true)
    try {
      const state = store.getState()
      const allDocs = state.documents

      const links: Backlink[] = []

      // Search through all documents for wikilinks to this doc
      for (const [id, doc] of Object.entries(allDocs)) {
        if (id === docId) continue

        // Get content from the Yjs doc
        const content = doc.ydoc.getXmlFragment('content')
        const text = content.toString()

        // Look for wikilinks that point to this document
        // The format is href="default/page-name" in the wikilink mark
        const docIdPattern = docId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const linkPattern = new RegExp(`href="${docIdPattern}"`, 'gi')

        if (linkPattern.test(text)) {
          // Extract context around the link
          const plainText = extractPlainText(text)
          const contextMatch = plainText.match(new RegExp(`.{0,30}${docId.split('/').pop()}.{0,30}`, 'i'))
          const context = contextMatch ? contextMatch[0] : ''

          links.push({
            docId: id,
            title: doc.metadata?.title || 'Untitled',
            context,
          })
        }
      }

      setBacklinks(links)
    } catch (error) {
      console.error('Error searching backlinks:', error)
      setBacklinks([])
    } finally {
      setLoading(false)
    }
  }, [docId, store])

  useEffect(() => {
    searchBacklinks()
  }, [searchBacklinks])

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
      <button
        className="backlinks-toggle"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
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
                  <Link
                    to="/doc/$docId"
                    params={{ docId: link.docId }}
                    className="backlink-link"
                  >
                    <strong className="backlink-title">{link.title}</strong>
                    {link.context && (
                      <span className="backlink-context">...{link.context}...</span>
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

/**
 * Extract plain text from XML fragment string
 */
function extractPlainText(xmlStr: string): string {
  // Simple extraction - remove XML tags
  return xmlStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
