/**
 * Embed Node Component
 *
 * Displays embedded content from linked xNet nodes (pages, databases).
 * Supports different view types and collapse/expand functionality.
 */

import { memo, useCallback, useState, useEffect } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type EmbedViewType = 'card' | 'full' | 'database' | 'kanban'

export interface EmbedNodeData {
  id: string
  type: 'embed'
  properties: {
    linkedNodeId: string
    viewType: EmbedViewType
    collapsed?: boolean
  }
}

export interface EmbedNodeProps {
  node: EmbedNodeData
  onUpdate: (changes: Partial<EmbedNodeData['properties']>) => void
  /** Optional function to load linked node data */
  loadNode?: (nodeId: string) => Promise<LinkedNodeData | null>
}

export interface LinkedNodeData {
  id: string
  schema: string
  properties: {
    title?: string
    content?: string
    columns?: Array<{ id: string; name: string }>
    rows?: Array<Record<string, unknown>>
  }
}

// ─── Mock Node Loader (for testing/standalone use) ───────────────────────────

const mockLoadNode = async (nodeId: string): Promise<LinkedNodeData | null> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Return mock data
  return {
    id: nodeId,
    schema: 'page',
    properties: {
      title: 'Linked Page',
      content: 'This is the content of the linked page...'
    }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const EmbedNodeComponent = memo(function EmbedNodeComponent({
  node,
  onUpdate,
  loadNode = mockLoadNode
}: EmbedNodeProps) {
  const { linkedNodeId, viewType, collapsed } = node.properties
  const [linkedNode, setLinkedNode] = useState<LinkedNodeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load linked node data
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await loadNode(linkedNodeId)
        if (!cancelled) {
          if (data) {
            setLinkedNode(data)
          } else {
            setError('Linked content not found')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [linkedNodeId, loadNode])

  const toggleCollapse = useCallback(() => {
    onUpdate({ collapsed: !collapsed })
  }, [collapsed, onUpdate])

  if (loading) {
    return (
      <div className="embed-node embed-node--loading" style={styles.nodeLoading}>
        <div style={styles.loadingSpinner} />
        <span>Loading...</span>
      </div>
    )
  }

  if (error || !linkedNode) {
    return (
      <div className="embed-node embed-node--error" style={styles.nodeError}>
        <div style={styles.errorIcon}>!</div>
        <span>{error ?? 'Failed to load linked content'}</span>
      </div>
    )
  }

  return (
    <div className={`embed-node embed-node--${viewType}`} style={styles.node}>
      <div className="embed-header" onClick={toggleCollapse} style={styles.header}>
        <NodeIcon schema={linkedNode.schema} />
        <span className="embed-title" style={styles.title}>
          {linkedNode.properties?.title ?? 'Untitled'}
        </span>
        <button className="collapse-button" style={styles.collapseButton}>
          {collapsed ? '+' : '−'}
        </button>
      </div>

      {!collapsed && (
        <div className="embed-content" style={styles.content}>
          <EmbedContent node={linkedNode} viewType={viewType} />
        </div>
      )}
    </div>
  )
})

// ─── Node Icon ───────────────────────────────────────────────────────────────

function NodeIcon({ schema }: { schema: string }) {
  const icon = schema === 'database' ? '▦' : schema === 'kanban' ? '◫' : '📄'
  return <span style={styles.icon}>{icon}</span>
}

// ─── Embed Content Views ─────────────────────────────────────────────────────

function EmbedContent({ node, viewType }: { node: LinkedNodeData; viewType: EmbedViewType }) {
  switch (viewType) {
    case 'card':
      return <CardEmbed node={node} />
    case 'database':
      return <DatabaseEmbed node={node} />
    case 'kanban':
      return <KanbanEmbed node={node} />
    case 'full':
    default:
      return <FullEmbed node={node} />
  }
}

function CardEmbed({ node }: { node: LinkedNodeData }) {
  const content = node.properties?.content ?? ''
  const excerpt = content.slice(0, 200)

  return (
    <div className="card-embed" style={embedStyles.card}>
      <p style={embedStyles.excerpt}>
        {excerpt}
        {content.length > 200 && '...'}
      </p>
    </div>
  )
}

function FullEmbed({ node }: { node: LinkedNodeData }) {
  return (
    <div className="full-embed" style={embedStyles.full}>
      <p>{node.properties?.content ?? 'No content'}</p>
    </div>
  )
}

function DatabaseEmbed({ node }: { node: LinkedNodeData }) {
  const columns = node.properties?.columns?.slice(0, 3) ?? []
  const rows = node.properties?.rows?.slice(0, 5) ?? []

  return (
    <div className="database-embed" style={embedStyles.database}>
      <div className="mini-table" style={embedStyles.table}>
        <div style={embedStyles.tableHeader}>
          {columns.map((col) => (
            <div key={col.id} style={embedStyles.tableCell}>
              {col.name}
            </div>
          ))}
        </div>
        {rows.map((row, i) => (
          <div key={i} style={embedStyles.tableRow}>
            {columns.map((col) => (
              <div key={col.id} style={embedStyles.tableCell}>
                {String(row[col.id] ?? '')}
              </div>
            ))}
          </div>
        ))}
        {(node.properties?.rows?.length ?? 0) > 5 && (
          <div style={embedStyles.moreRows}>
            +{(node.properties?.rows?.length ?? 0) - 5} more rows
          </div>
        )}
      </div>
    </div>
  )
}

function KanbanEmbed({ node: _node }: { node: LinkedNodeData }) {
  return (
    <div className="kanban-embed" style={embedStyles.kanban}>
      <div style={embedStyles.kanbanColumn}>
        <div style={embedStyles.kanbanHeader}>To Do</div>
        <div style={embedStyles.kanbanPlaceholder}>...</div>
      </div>
      <div style={embedStyles.kanbanColumn}>
        <div style={embedStyles.kanbanHeader}>In Progress</div>
        <div style={embedStyles.kanbanPlaceholder}>...</div>
      </div>
      <div style={embedStyles.kanbanColumn}>
        <div style={embedStyles.kanbanHeader}>Done</div>
        <div style={embedStyles.kanbanPlaceholder}>...</div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  node: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden'
  },
  nodeLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    height: '100%',
    background: 'white',
    borderRadius: '8px',
    color: '#6b7280'
  },
  nodeError: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    height: '100%',
    background: '#fef2f2',
    borderRadius: '8px',
    color: '#dc2626'
  },
  loadingSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  errorIcon: {
    width: '24px',
    height: '24px',
    background: '#ef4444',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer'
  },
  icon: {
    fontSize: '14px'
  },
  title: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  collapseButton: {
    border: 'none',
    background: 'transparent',
    fontSize: '16px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1
  },
  content: {
    flex: 1,
    padding: '12px',
    overflow: 'auto'
  }
}

const embedStyles: Record<string, React.CSSProperties> = {
  card: {
    fontSize: '13px',
    color: '#374151'
  },
  excerpt: {
    margin: 0,
    lineHeight: 1.5
  },
  full: {
    fontSize: '14px',
    color: '#111827',
    lineHeight: 1.6
  },
  database: {},
  table: {
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  tableHeader: {
    display: 'flex',
    background: '#f9fafb',
    fontWeight: 500,
    fontSize: '12px'
  },
  tableRow: {
    display: 'flex',
    borderTop: '1px solid #e5e7eb',
    fontSize: '12px'
  },
  tableCell: {
    flex: 1,
    padding: '6px 8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  moreRows: {
    padding: '6px 8px',
    fontSize: '11px',
    color: '#6b7280',
    borderTop: '1px solid #e5e7eb'
  },
  kanban: {
    display: 'flex',
    gap: '8px'
  },
  kanbanColumn: {
    flex: 1,
    background: '#f3f4f6',
    borderRadius: '4px',
    padding: '8px'
  },
  kanbanHeader: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#6b7280',
    marginBottom: '8px'
  },
  kanbanPlaceholder: {
    fontSize: '12px',
    color: '#9ca3af',
    textAlign: 'center',
    padding: '12px'
  }
}
