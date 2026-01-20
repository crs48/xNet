/**
 * Document page - editor
 */
import { createRoute } from '@tanstack/react-router'
import { useDocument, usePresence } from '@xnet/react'
import { Editor } from '../components/Editor'
import { Route as RootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/doc/$docId',
  component: DocumentPage
})

function DocumentPage() {
  const { docId } = Route.useParams()
  const { data: document, loading, error, update } = useDocument(docId)
  const { remotePresences } = usePresence(docId)

  if (loading) {
    return <div className="loading">Loading document...</div>
  }

  if (error) {
    return <div className="error">Error: {error.message}</div>
  }

  if (!document) {
    return <div className="not-found">Document not found</div>
  }

  return (
    <div className="document-page">
      <div className="document-header">
        <input
          type="text"
          className="title-input"
          value={document.metadata?.title || ''}
          onChange={(e) => update((d) => {
            if (d.metadata) d.metadata.title = e.target.value
          })}
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

      <Editor document={document} />
    </div>
  )
}
