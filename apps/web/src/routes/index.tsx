/**
 * Home page - document list
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useNodeStore } from '@xnet/react'
import { PageSchema } from '@xnet/data'

export const Route = createFileRoute('/')({
  component: HomePage
})

function HomePage() {
  const navigate = useNavigate()
  const { isReady } = useNodeStore()
  const { data: pages, loading } = useQuery(PageSchema, { limit: 50 })

  const createDocument = async () => {
    // Navigate to a new page with a random ID
    const id = Math.random().toString(36).substring(2, 15)
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

      {pages.length === 0 ? (
        <div className="empty-state">
          <p>No documents yet. Create your first page!</p>
        </div>
      ) : (
        <ul className="document-list">
          {pages.map((page) => (
            <li key={page.id}>
              <Link to="/doc/$docId" params={{ docId: page.id }}>
                <span className="doc-title">{(page.properties.title as string) || 'Untitled'}</span>
                <span className="doc-date">{new Date(page.updatedAt).toLocaleDateString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
