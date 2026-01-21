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
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        Loading document...
      </div>
    )
  }

  if (error) {
    return <div className="text-center p-6 text-danger">Error: {error.message}</div>
  }

  if (!page || !doc) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        Creating document...
      </div>
    )
  }

  const connected = syncStatus === 'connected'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <input
          type="text"
          className="text-3xl font-semibold border-none bg-transparent text-text w-full outline-none placeholder:text-text-secondary"
          value={(page.properties.title as string) || ''}
          onChange={(e) => {
            const newTitle = e.target.value
            update(docId, { title: newTitle })
          }}
          placeholder="Untitled"
        />

        {/* Sync status indicator */}
        <div
          className="flex items-center gap-1.5 text-xs text-text-secondary"
          title={connected ? `Connected (${peerCount} peers)` : syncStatus}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              connected ? 'bg-success' : 'bg-text-secondary'
            }`}
          />
          {peerCount > 0 && <span className="text-xs font-medium">{peerCount}</span>}
        </div>

        {remotePresences.length > 0 && (
          <div className="flex -space-x-2">
            {remotePresences.map((p) => (
              <span
                key={p.name}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white border-2 border-bg"
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
