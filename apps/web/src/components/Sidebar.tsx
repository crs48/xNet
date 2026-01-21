/**
 * Sidebar component
 */
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@xnet/react'
import { PageSchema } from '@xnet/data'

export function Sidebar() {
  const location = useLocation()
  const { data: pages, loading } = useQuery(PageSchema, { limit: 20 })

  return (
    <aside className="sidebar">
      <nav>
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          All Pages
        </Link>

        <div className="sidebar-section">
          <h3>Recent</h3>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ul>
              {pages.slice(0, 10).map((page) => (
                <li key={page.id}>
                  <Link
                    to="/doc/$docId"
                    params={{ docId: page.id }}
                    className={location.pathname.includes(page.id) ? 'active' : ''}
                  >
                    {(page.properties.title as string) || 'Untitled'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
