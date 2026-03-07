/**
 * Changed-files panel for the coding workspace.
 */

import type { WorkspaceSessionReview } from '../../../shared/workspace-session'
import { Badge } from '@xnetjs/ui'
import React from 'react'

type ChangedFilesPanelProps = {
  review: WorkspaceSessionReview | null
  loading: boolean
  error: Error | null
}

export function ChangedFilesPanel({
  review,
  loading,
  error
}: ChangedFilesPanelProps): React.ReactElement {
  if (loading) {
    return <div className="p-5 text-sm text-muted-foreground">Loading changed files...</div>
  }

  if (error) {
    return <div className="p-5 text-sm text-destructive">{error.message}</div>
  }

  if (!review || review.changedFiles.length === 0) {
    return <div className="p-5 text-sm text-muted-foreground">No changed files yet.</div>
  }

  return (
    <div className="space-y-3 p-5">
      {review.changedFiles.map((file) => (
        <div
          key={`${file.status}:${file.path}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{file.path}</p>
            <p className="text-xs text-muted-foreground">{file.status}</p>
          </div>
          <Badge variant="outline">{file.status}</Badge>
        </div>
      ))}
    </div>
  )
}
