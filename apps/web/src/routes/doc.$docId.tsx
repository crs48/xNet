/**
 * Document page - editor
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDocument } from '@xnet/react'
import { PageSchema } from '@xnet/data'
import { Editor } from '../components/Editor'
import { BacklinksPanel } from '../components/BacklinksPanel'

export const Route = createFileRoute('/doc/$docId')({
  component: DocumentPage
})

function DocumentPage() {
  const { docId } = Route.useParams()
  const navigate = useNavigate()

  // Load document with Y.Doc, sync, presence, and auto-create
  const {
    data: page,
    doc,
    update,
    loading,
    error,
    syncStatus,
    peerCount,
    remoteUsers
  } = useDocument(PageSchema, docId, {
    createIfMissing: { title: 'Untitled' },
    user: { name: 'You' } // TODO: Get from identity
  })

  // Handle wikilink navigation
  const handleNavigate = (targetDocId: string) => {
    navigate({ to: '/doc/$docId', params: { docId: targetDocId } })
  }

  if (loading) {
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
      <div className="flex items-center justify-center h-full text-text-secondary">Loading...</div>
    )
  }

  const connected = syncStatus === 'connected'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <input
          type="text"
          className="text-3xl font-semibold border-none bg-transparent text-text w-full outline-none placeholder:text-text-secondary"
          value={page.title || ''}
          onChange={(e) => update({ title: e.target.value })}
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

        {remoteUsers.length > 0 && (
          <div className="flex -space-x-2">
            {remoteUsers.map((user) => (
              <span
                key={user.id}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white border-2 border-bg"
                style={{ backgroundColor: user.color }}
                title={user.name}
              >
                {user.name?.[0] || '?'}
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
