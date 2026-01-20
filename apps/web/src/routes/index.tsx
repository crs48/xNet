/**
 * Home page - document list
 */
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useXNet } from '@xnet/react'
import { Route as RootRoute } from './__root'

// Document type for query results
interface QueryDocument {
  id: string
  title: string
  updated: number
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomePage
})

function HomePage() {
  const navigate = useNavigate()
  const { isReady } = useXNet()
  const { data: documents, loading } = useQuery<QueryDocument>({
    type: 'page',
    filters: [],
    sort: [{ field: 'updated', direction: 'desc' }],
    limit: 50
  })

  const createDocument = async () => {
    // Note: In a real implementation, this would use the SDK client
    // For now, we'll just navigate to a new page
    const id = `default/${Math.random().toString(36).substring(2, 15)}`
    navigate({ to: '/doc/$docId', params: { docId: id } })
  }

  if (!isReady || loading) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div className="home-page">
      <div className="page-header">
        <h1>All Pages</h1>
        <button onClick={createDocument} className="btn-primary">
          + New Page
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="empty-state">
          <p>No documents yet. Create your first page!</p>
        </div>
      ) : (
        <ul className="document-list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link to="/doc/$docId" params={{ docId: doc.id }}>
                <span className="doc-title">{doc.title || 'Untitled'}</span>
                <span className="doc-date">
                  {new Date(doc.updated).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
