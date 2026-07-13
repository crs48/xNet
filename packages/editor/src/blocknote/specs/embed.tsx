/**
 * Media embed block (YouTube, Spotify, Vimeo, …). Replaces the TipTap
 * EmbedExtension; provider detection stays in @xnetjs/data.
 */
import { createReactBlockSpec } from '@blocknote/react'
import { parseEmbedUrl } from '@xnetjs/data'
import * as React from 'react'

function EmbedCard({ url }: { url: string }): React.JSX.Element {
  const parsed = React.useMemo(() => (url ? parseEmbedUrl(url) : null), [url])

  if (!parsed) {
    return (
      <a
        data-embed-url={url}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="xnet-embed-fallback"
      >
        {url}
      </a>
    )
  }

  const aspectRatio = parsed.provider.aspectRatio ?? 16 / 9
  return (
    <div data-embed-url={url} data-embed-provider={parsed.provider.name} className="xnet-embed">
      <iframe
        src={parsed.embedUrl}
        title={`${parsed.provider.displayName} embed`}
        style={{ width: '100%', aspectRatio: String(aspectRatio), border: 0 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  )
}

export const EmbedBlockSpec = createReactBlockSpec(
  {
    type: 'embed',
    propSchema: {
      url: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ block }) => <EmbedCard url={block.props.url} />
  }
)
