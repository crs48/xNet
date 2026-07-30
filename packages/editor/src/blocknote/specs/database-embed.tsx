/**
 * Database embed block — inline table/board/list view of a workspace
 * database. The actual view is host-rendered (renderDatabaseView), same
 * contract as the TipTap DatabaseEmbedExtension it replaces.
 */
import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { useEditorHost, type DatabaseViewType } from '../host-context'

/**
 * Any non-empty view type travels through to the host (0346) — the host
 * dispatches through its view registry and owns the unknown-type
 * fallback, so plugin view types work without an editor release.
 */
function coerceViewType(raw: string): DatabaseViewType {
  return raw.trim() ? (raw as DatabaseViewType) : 'table'
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
  viewConfig,
  onChangeViewType
}: {
  databaseId: string
  viewType: string
  viewConfig: string
  onChangeViewType?: (viewType: DatabaseViewType) => void
}): React.JSX.Element {
  const host = useEditorHost()
  const config = React.useMemo(() => parseViewConfig(viewConfig), [viewConfig])

  if (!databaseId) {
    return <div className="xnet-database-embed-placeholder">Select a database…</div>
  }

  return (
    // min-w-0: the BlockNote content wrapper is a flex row; without it the
    // embed balloons to the grid's natural width and clips unreachably.
    <div data-database-embed={databaseId} className="xnet-database-embed w-full min-w-0 max-w-full">
      {host.renderDatabaseView ? (
        host.renderDatabaseView({
          databaseId,
          viewType: coerceViewType(viewType),
          viewConfig: config,
          onChangeViewType: host.readOnly ? undefined : onChangeViewType
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
    render: ({ block, editor }) => (
      <DatabaseEmbedCard
        databaseId={block.props.databaseId}
        viewType={block.props.viewType}
        viewConfig={block.props.viewConfig}
        onChangeViewType={(viewType) => {
          editor.updateBlock(block, { props: { viewType } } as never)
        }}
      />
    ),
    // Deep-interactive NodeView (0346): without this, ProseMirror keeps
    // node-selecting the block and re-grabbing focus, so grid clicks and
    // keystrokes edit the DOCUMENT instead of the cell. selectable:false
    // applies BlockNote's stopEvent-everything isolation; deletion still
    // works through the side-menu drag handle.
    meta: { selectable: false }
  }
)
