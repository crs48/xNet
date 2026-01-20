/**
 * Document page - editor
 */
import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDocument, usePresence, useXNet } from '@xnet/react'
import { Editor } from '../components/Editor'
import { BacklinksPanel } from '../components/BacklinksPanel'

export const Route = createFileRoute('/doc/$docId')({
  component: DocumentPage
})

function DocumentPage() {
  const { docId } = Route.useParams()
  const navigate = useNavigate()
  const { store } = useXNet()
  const { data: document, loading, error, update } = useDocument(docId)
  const { remotePresences } = usePresence(docId)
  const [creating, setCreating] = useState(false)

  // Handle wikilink navigation
  const handleNavigate = (targetDocId: string) => {
    navigate({ to: '/doc/$docId', params: { docId: targetDocId } })
  }

  // Auto-create document if it doesn't exist
  useEffect(() => {
    if (!loading && !document && !error && !creating) {
      setCreating(true)
      store.getState().createDocument(docId).finally(() => {
        setCreating(false)
      })
    }
  }, [loading, document, error, creating, docId, store])

  if (loading || creating) {
    return <div className="loading">Loading document...</div>
  }

  if (error) {
    return <div className="error">Error: {error.message}</div>
  }

  if (!document) {
    return <div className="loading">Creating document...</div>
  }

  return (
    <div className="document-page">
      <div className="document-header">
        <input
          type="text"
          className="title-input"
          value={document.metadata?.title || ''}
          onChange={(e) => {
            const newTitle = e.target.value
            update((d) => {
              if (d.metadata) d.metadata.title = newTitle
              // Also update Yjs metadata map for persistence
              d.ydoc.getMap('metadata').set('title', newTitle)
            })
          }}
          placeholder="Untitled"
        />

        {remotePresences.length > 0 && (
          <div className="presence-avatars">
            {remotePresences.map((p) => (
              <span
                key={p.name}
                className="avatar"
                style={{ backgroundColor: p.color }}
                title={p.name}
              >
                {p.name?.[0] || '?'}
              </span>
            ))}
          </div>
        )}
      </div>

      <Editor document={document} onNavigate={handleNavigate} />

      <BacklinksPanel docId={docId} />
    </div>
  )
}
