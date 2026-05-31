/**
 * Rich link preview card NodeView for generic URLs.
 */

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import * as React from 'react'
import { cn } from '../../utils'

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

export function RichLinkNodeView({ node, selected }: NodeViewProps) {
  const { url, title, subtitle, icon } = node.attrs
  const href = typeof url === 'string' ? url : ''
  const label = typeof title === 'string' && title.length > 0 ? title : getHostname(href)
  const detail = typeof subtitle === 'string' && subtitle.length > 0 ? subtitle : href
  const badge = typeof icon === 'string' && icon.length > 0 ? icon : 'LINK'

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'my-2 rounded-md border border-border bg-background p-3 shadow-sm transition-colors',
        selected ? 'ring-2 ring-primary ring-offset-2' : 'hover:border-primary/45'
      )}
      data-rich-link-card="true"
      data-drag-handle
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-start gap-3 text-left no-underline"
        data-rich-link-open="true"
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground"
          data-rich-link-icon="true"
        >
          {badge}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-medium text-foreground"
            data-rich-link-title="true"
          >
            {label}
          </span>
          <span
            className="mt-1 block truncate text-xs text-muted-foreground"
            data-rich-link-subtitle="true"
          >
            {detail}
          </span>
        </span>
      </a>
    </NodeViewWrapper>
  )
}
