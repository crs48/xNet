/**
 * Page embed block — a block reference to another workspace node.
 * Replaces the TipTap PageEmbedExtension.
 *
 * When the host provides `renderPageEmbed` (0346) the block renders a
 * live summary-tier transclusion of the target; otherwise it falls back
 * to the original navigation card.
 */
import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { useEditorHost } from '../host-context'

function PageEmbedCard({ nodeId, title }: { nodeId: string; title: string }): React.JSX.Element {
  const host = useEditorHost()

  if (host.renderPageEmbed && nodeId) {
    return (
      <div data-page-embed={nodeId} className="xnet-page-embed w-full">
        {host.renderPageEmbed({ nodeId, title })}
      </div>
    )
  }

  return (
    <button
      type="button"
      data-page-embed={nodeId}
      className="xnet-page-embed inline-flex w-full items-center gap-2 rounded-md border border-border/60 bg-transparent px-3 py-2 text-left hover:bg-muted/40"
      onClick={() => host.onNavigate?.(nodeId)}
    >
      <span aria-hidden="true">📄</span>
      <span className="xnet-page-embed-title font-medium underline-offset-2 hover:underline">
        {title || nodeId}
      </span>
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
