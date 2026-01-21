/**
 * Document page - editor
 */
import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDocument, usePresence, useMutate } from '@xnet/react'
import { PageSchema } from '@xnet/data'
import { Editor } from '../components/Editor'
import { BacklinksPanel } from '../components/BacklinksPanel'

export const Route = createFileRoute('/doc/$docId')({
  component: DocumentPage
})

function DocumentPage() {
  const { docId } = Route.useParams()
  const navigate = useNavigate()
  const { update } = useMutate()
  const [creating, setCreating] = useState(false)

  // Load document with Y.Doc and sync
  const { data: page, doc, loading, error, syncStatus, peerCount } = useDocument(PageSchema, docId)

  const { remotePresences } = usePresence(docId)

  // Handle wikilink navigation
  const handleNavigate = (targetDocId: string) => {
    navigate({ to: '/doc/$docId', params: { docId: targetDocId } })
  }

  // Auto-create document if it doesn't exist
  const { create } = useMutate()

  useEffect(() => {
    if (!loading && !page && !error && !creating) {
      setCreating(true)
      create(PageSchema, { title: 'Untitled' }, docId)
        .then(() => setCreating(false))
        .catch(() => setCreating(false))
    }
  }, [loading, page, error, creating, docId, create])

  if (loading || creating) {
    return <div className="loading">Loading document...</div>
  }

  if (error) {
    return <div className="error">Error: {error.message}</div>
  }

  if (!page || !doc) {
    return <div className="loading">Creating document...</div>
  }

  const connected = syncStatus === 'connected'

  return (
    <div className="document-page">
      <div className="document-header">
        <input
          type="text"
          className="title-input"
          value={(page.properties.title as string) || ''}
          onChange={(e) => {
            const newTitle = e.target.value
            update(docId, { title: newTitle })
          }}
          placeholder="Untitled"
        />

        {/* Sync status indicator */}
        <div
          className="sync-status"
          title={connected ? `Connected (${peerCount} peers)` : syncStatus}
        >
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

      <Editor doc={doc} onNavigate={handleNavigate} />

      <BacklinksPanel docId={docId} />
    </div>
  )
}
