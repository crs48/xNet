/**
 * Diff panel for the coding workspace.
 */

import type { WorkspaceSessionReview } from '../../../shared/workspace-session'
import { CodeBlock } from '@xnetjs/ui'
import React from 'react'

type DiffPanelProps = {
  review: WorkspaceSessionReview | null
  loading: boolean
  error: Error | null
}

export function DiffPanel({ review, loading, error }: DiffPanelProps): React.ReactElement {
  if (loading) {
    return <div className="p-5 text-sm text-muted-foreground">Loading diff...</div>
  }

  if (error) {
    return <div className="p-5 text-sm text-destructive">{error.message}</div>
  }

  if (!review) {
    return (
      <div className="p-5 text-sm text-muted-foreground">Select a session to inspect its diff.</div>
    )
  }

  return (
    <div className="grid h-full gap-4 p-5">
      <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Diff stat</p>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
          {review.diffStat || 'No diff stat available.'}
        </p>
      </div>

      <div className="min-h-0 rounded-[24px] border border-border/70 bg-background/80 p-4">
        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">Patch</p>
        <CodeBlock code={review.diffPatch || 'No patch available.'} maxHeight={520} />
      </div>
    </div>
  )
}
