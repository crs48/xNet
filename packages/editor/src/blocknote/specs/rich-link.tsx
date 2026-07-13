/**
 * Rich link preview card (0295). Replaces the TipTap RichLinkExtension.
 * The preview is sender-resolved once at paste time and stored on the
 * block (JSON string prop), so peers render without re-fetching.
 */
import { createReactBlockSpec } from '@blocknote/react'
import type { MessageLinkPreview } from '@xnetjs/data'
import * as React from 'react'

export function parseStoredPreview(raw: string): MessageLinkPreview | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as MessageLinkPreview) : null
  } catch {
    return null
  }
}

function RichLinkCard({ url, preview }: { url: string; preview: string }): React.JSX.Element {
  const card = React.useMemo(() => parseStoredPreview(preview), [preview])

  return (
    <a
      data-rich-link=""
      href={url}
      target="_blank"
      rel="noreferrer"
      className="xnet-rich-link block border rounded-md p-3 no-underline"
    >
      <span className="xnet-rich-link-title block font-medium">
        {card?.title || url}
      </span>
      {card?.description ? (
        <span className="xnet-rich-link-description block text-sm opacity-80">
          {card.description}
        </span>
      ) : null}
      <span className="xnet-rich-link-url block text-xs opacity-60">{url}</span>
    </a>
  )
}

export const RichLinkBlockSpec = createReactBlockSpec(
  {
    type: 'richLink',
    propSchema: {
      url: { default: '' },
      preview: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ block }) => <RichLinkCard url={block.props.url} preview={block.props.preview} />
  }
)
