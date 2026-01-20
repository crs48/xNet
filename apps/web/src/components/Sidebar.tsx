/**
 * Sidebar component
 */
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@xnet/react'

// Document type for query results
interface QueryDocument {
  id: string
  title: string
  updated: number
}

export function Sidebar() {
  const location = useLocation()
  const { data: documents } = useQuery<QueryDocument>({
    type: 'page',
    filters: [],
    sort: [{ field: 'updated', direction: 'desc' }],
    limit: 20
  })

  return (
    <aside className="sidebar">
      <nav>
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          All Pages
        </Link>

        <div className="sidebar-section">
          <h3>Recent</h3>
          <ul>
            {documents.slice(0, 10).map((doc) => (
              <li key={doc.id}>
                <Link
                  to="/doc/$docId"
                  params={{ docId: doc.id }}
                  className={location.pathname.includes(doc.id) ? 'active' : ''}
                >
                  {doc.title || 'Untitled'}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Link
          to="/settings"
          className={location.pathname === '/settings' ? 'active' : ''}
          style={{ marginTop: 'auto' }}
        >
          Settings
        </Link>
      </nav>
    </aside>
  )
}
