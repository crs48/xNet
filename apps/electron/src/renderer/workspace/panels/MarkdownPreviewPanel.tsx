/**
 * Markdown preview panel for the coding workspace.
 */

import type { WorkspaceSessionReview } from '../../../shared/workspace-session'
import { MarkdownContent } from '@xnetjs/ui'
import React from 'react'

type MarkdownPreviewPanelProps = {
  review: WorkspaceSessionReview | null
  fallbackContent: string
  loading: boolean
  error: Error | null
}

export function MarkdownPreviewPanel({
  review,
  fallbackContent,
  loading,
  error
}: MarkdownPreviewPanelProps): React.ReactElement {
  if (loading) {
    return <div className="p-5 text-sm text-muted-foreground">Loading markdown preview...</div>
  }

  if (error) {
    return <div className="p-5 text-sm text-destructive">{error.message}</div>
  }

  const content = review?.markdownPreview?.content || fallbackContent

  return (
    <div className="h-full overflow-y-auto rounded-[28px] border border-border/70 bg-background/85 p-5">
      <MarkdownContent content={content} className="prose prose-invert max-w-none" />
    </div>
  )
}
