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
    <aside className="w-[260px] bg-bg-secondary border-r border-border overflow-y-auto p-4">
      <nav className="flex flex-col gap-1">
        <Link
          to="/"
          className={`px-3 py-2 rounded-md text-sm no-underline hover:no-underline transition-colors ${
            location.pathname === '/' ? 'bg-primary text-white' : 'text-text hover:bg-border'
          }`}
        >
          All Pages
        </Link>

        <div className="mt-6">
          <h3 className="text-xs font-semibold text-text-secondary uppercase mb-2 px-3">Recent</h3>
          {loading ? (
            <p className="px-3 text-sm text-text-secondary">Loading...</p>
          ) : (
            <ul className="list-none">
              {pages.slice(0, 10).map((page) => (
                <li key={page.id}>
                  <Link
                    to="/doc/$docId"
                    params={{ docId: page.id }}
                    className={`block px-3 py-2 rounded-md text-sm truncate no-underline hover:no-underline transition-colors ${
                      location.pathname.includes(page.id)
                        ? 'bg-primary text-white'
                        : 'text-text hover:bg-border'
                    }`}
                  >
                    {page.title || 'Untitled'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link
          to="/settings"
          className={`mt-auto px-3 py-2 rounded-md text-sm no-underline hover:no-underline transition-colors ${
            location.pathname === '/settings'
              ? 'bg-primary text-white'
              : 'text-text hover:bg-border'
          }`}
        >
          Settings
        </Link>
      </nav>
    </aside>
  )
}
