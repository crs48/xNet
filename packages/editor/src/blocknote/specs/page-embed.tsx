/**
 * Page embed block — a block reference card to another workspace node.
 * Replaces the TipTap PageEmbedExtension.
 */
import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { useEditorHost } from '../host-context'

function PageEmbedCard({ nodeId, title }: { nodeId: string; title: string }): React.JSX.Element {
  const host = useEditorHost()
  return (
    <button
      type="button"
      data-page-embed={nodeId}
      className="xnet-page-embed"
      onClick={() => host.onNavigate?.(nodeId)}
    >
      <span aria-hidden="true">📄</span>
      <span className="xnet-page-embed-title">{title || nodeId}</span>
    </button>
  )
}

export const PageEmbedBlockSpec = createReactBlockSpec(
  {
    type: 'pageEmbed',
    propSchema: {
      nodeId: { default: '' },
      title: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ block }) => <PageEmbedCard nodeId={block.props.nodeId} title={block.props.title} />
  }
)
