/**
 * Document page - editor
 */
import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDocument, usePresence, useXNet, useDocumentSync } from '@xnet/react'
import { Editor } from '../components/Editor'
import { BacklinksPanel } from '../components/BacklinksPanel'

// Signaling servers - use local server for development
const SIGNALING_SERVERS = import.meta.env.VITE_SIGNALING_SERVERS?.split(',') || ['ws://localhost:4000']

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

  // Enable P2P sync for this document
  const { connected, peerCount } = useDocumentSync({
    document,
    signalingServers: SIGNALING_SERVERS,
    enabled: !!document
  })

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

        {/* Sync status indicator */}
        <div className="sync-status" title={connected ? `Connected (${peerCount} peers)` : 'Offline'}>
          <span className={`sync-dot ${connected ? 'connected' : 'offline'}`} />
          {peerCount > 0 && <span className="peer-count">{peerCount}</span>}
        </div>

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
