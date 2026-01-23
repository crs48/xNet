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
  const { data: pages, loading } = useQuery(PageSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 50
  })

  const createDocument = async () => {
    // Navigate to a new page with a random ID
    const id = Math.random().toString(36).substring(2, 15)
    navigate({ to: '/doc/$docId', params: { docId: id } })
  }

  if (!isReady || loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">All Pages</h1>
        <button
          onClick={createDocument}
          className="bg-primary text-white border-none px-4 py-2 rounded-md cursor-pointer text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          + New Page
        </button>
      </div>

      {pages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No documents yet. Create your first page!</p>
        </div>
      ) : (
        <ul className="list-none">
          {pages.map((page) => (
            <li key={page.id} className="border-b border-border last:border-b-0">
              <Link
                to="/doc/$docId"
                params={{ docId: page.id }}
                className="flex justify-between items-center py-4 text-foreground no-underline hover:no-underline"
              >
                <span className="font-medium">{page.title || 'Untitled'}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(page.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
