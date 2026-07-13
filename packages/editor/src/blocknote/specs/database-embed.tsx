/**
 * Database embed block — inline table/board/list view of a workspace
 * database. The actual view is host-rendered (renderDatabaseView), same
 * contract as the TipTap DatabaseEmbedExtension it replaces.
 */
import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { useEditorHost, type DatabaseViewType } from '../host-context'

const VIEW_TYPES: readonly DatabaseViewType[] = [
  'table',
  'board',
  'list',
  'gallery',
  'calendar',
  'form'
]

function coerceViewType(raw: string): DatabaseViewType {
  return (VIEW_TYPES as readonly string[]).includes(raw) ? (raw as DatabaseViewType) : 'table'
}

/** viewConfig travels as a JSON string (BlockNote props are scalars only). */
export function parseViewConfig(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function DatabaseEmbedCard({
  databaseId,
  viewType,
  viewConfig
}: {
  databaseId: string
  viewType: string
  viewConfig: string
}): React.JSX.Element {
  const host = useEditorHost()
  const config = React.useMemo(() => parseViewConfig(viewConfig), [viewConfig])

  if (!databaseId) {
    return <div className="xnet-database-embed-placeholder">Select a database…</div>
  }

  return (
    <div data-database-embed={databaseId} className="xnet-database-embed">
      {host.renderDatabaseView ? (
        host.renderDatabaseView({
          databaseId,
          viewType: coerceViewType(viewType),
          viewConfig: config
        })
      ) : (
        <div className="xnet-database-embed-placeholder">Database {databaseId}</div>
      )}
    </div>
  )
}

export const DatabaseEmbedBlockSpec = createReactBlockSpec(
  {
    type: 'databaseEmbed',
    propSchema: {
      databaseId: { default: '' },
      viewType: { default: 'table' },
      viewConfig: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ block }) => (
      <DatabaseEmbedCard
        databaseId={block.props.databaseId}
        viewType={block.props.viewType}
        viewConfig={block.props.viewConfig}
      />
    )
  }
)
