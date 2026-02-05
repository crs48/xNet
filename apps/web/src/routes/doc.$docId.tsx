/**
 * Document page - editor
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PageSchema } from '@xnet/data'
import { useNode } from '@xnet/react'
import { BacklinksPanel } from '../components/BacklinksPanel'
import { Editor } from '../components/Editor'
import { PresenceAvatars } from '../components/PresenceAvatars'
import { ShareButton } from '../components/ShareButton'

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
    presence
  } = useNode(PageSchema, docId, {
    createIfMissing: { title: 'Untitled' },
    disableSync: true // Disable sync until signaling server is available
  })

  // Handle wikilink navigation
  const handleNavigate = (targetDocId: string) => {
    navigate({ to: '/doc/$docId', params: { docId: targetDocId } })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading document...
      </div>
    )
  }

  if (error) {
    return <div className="text-center p-6 text-danger">Error: {error.message}</div>
  }

  if (!page || !doc) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    )
  }

  const connected = syncStatus === 'connected'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <input
          type="text"
          className="text-3xl font-semibold border-none bg-transparent text-foreground w-full outline-none placeholder:text-muted-foreground"
          value={page.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
        />

        {/* Presence avatars */}
        <PresenceAvatars presence={presence} />

        {/* Share button */}
        <ShareButton docId={docId} docType="page" />

        {/* Sync status indicator */}
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title={connected ? `Connected (${peerCount} peers)` : syncStatus}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              connected ? 'bg-success' : 'bg-muted-foreground'
            }`}
          />
          {peerCount > 0 && <span className="text-xs font-medium">{peerCount}</span>}
        </div>
      </div>

      <Editor doc={doc} onNavigate={handleNavigate} />

      <BacklinksPanel docId={docId} />
    </div>
  )
}
