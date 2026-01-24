/**
 * EmbedNodeView - React NodeView for media embeds (YouTube, Spotify, etc.).
 *
 * Features:
 * - Responsive iframe with aspect ratio preservation
 * - Provider badge overlay (icon + name)
 * - Open in new tab button
 * - Loading state
 */
import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { cn } from '../../utils'
import { EMBED_PROVIDERS, type EmbedProvider } from './providers'

/** Get provider config by name */
function getProvider(name: string): EmbedProvider | undefined {
  return EMBED_PROVIDERS.find((p) => p.name === name)
}

export function EmbedNodeView({ node, selected }: NodeViewProps) {
  const { url, provider: providerName, embedUrl, title } = node.attrs
  const [loading, setLoading] = React.useState(true)
  const provider = getProvider(providerName)

  const aspectRatio = provider?.aspectRatio || 16 / 9
  const paddingBottom = `${(1 / aspectRatio) * 100}%`

  // No embed URL - show error state
  if (!embedUrl) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'flex items-center justify-center p-6 rounded-lg my-2',
            'bg-gray-50 dark:bg-gray-800',
            'border border-gray-200 dark:border-gray-700',
            'text-gray-500 dark:text-gray-400',
            selected && 'ring-2 ring-blue-500 ring-offset-2'
          )}
          data-drag-handle
        >
          <span className="text-sm">Unable to embed: {url || 'No URL provided'}</span>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'relative rounded-lg my-2 overflow-hidden group',
          'border border-gray-200 dark:border-gray-700',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
      >
        {/* Responsive iframe container */}
        <div className="relative w-full" style={{ paddingBottom }}>
          {/* Loading state */}
          {loading && (
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                'bg-gray-100 dark:bg-gray-800'
              )}
            >
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-2 text-gray-400">
                  <svg
                    className="animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                </div>
                <p className="text-xs text-gray-500">
                  Loading {provider?.displayName || 'embed'}...
                </p>
              </div>
            </div>
          )}

          {/* Iframe */}
          <iframe
            src={embedUrl}
            title={title || `${provider?.displayName || 'Embedded'} content`}
            className="absolute inset-0 w-full h-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            onLoad={() => setLoading(false)}
          />
        </div>

        {/* Provider badge (top-left, visible on hover) */}
        {provider && (
          <div
            className={cn(
              'absolute top-2 left-2',
              'flex items-center gap-1.5 px-2 py-1',
              'bg-black/70 text-white rounded-md text-xs',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
              'pointer-events-none'
            )}
          >
            <span>{provider.icon}</span>
            <span>{provider.displayName}</span>
          </div>
        )}

        {/* Open in new tab button (top-right, visible on hover) */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'absolute top-2 right-2',
              'flex items-center gap-1 px-2 py-1',
              'bg-black/70 text-white rounded-md text-xs',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
              'hover:bg-black/90'
            )}
            aria-label="Open in new tab"
            title="Open in new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <span>Open</span>
          </a>
        )}
      </div>
    </NodeViewWrapper>
  )
}
