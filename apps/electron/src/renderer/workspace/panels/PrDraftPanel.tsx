/**
 * PR draft panel for the coding workspace.
 */

import type { WorkspaceSessionReview } from '../../../shared/workspace-session'
import { Badge, Button, CodeBlock } from '@xnetjs/ui'
import { Camera, GitPullRequest } from 'lucide-react'
import React from 'react'

type PrDraftPanelProps = {
  review: WorkspaceSessionReview | null
  prStatus: string | null
  loading: boolean
  creatingPullRequest: boolean
  capturingScreenshot: boolean
  onCaptureScreenshot: () => void
  onCreatePullRequest: () => void
}

export function PrDraftPanel({
  review,
  prStatus,
  loading,
  creatingPullRequest,
  capturingScreenshot,
  onCaptureScreenshot,
  onCreatePullRequest
}: PrDraftPanelProps): React.ReactElement {
  if (loading) {
    return <div className="p-5 text-sm text-muted-foreground">Loading PR draft...</div>
  }

  if (!review) {
    return <div className="p-5 text-sm text-muted-foreground">Select a session to draft a PR.</div>
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">
          {review.prDraft.screenshotPath ? 'Screenshot ready' : 'No screenshot'}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={capturingScreenshot}
          leftIcon={!capturingScreenshot ? <Camera /> : undefined}
          onClick={onCaptureScreenshot}
        >
          Capture screenshot
        </Button>
        <Button
          type="button"
          size="sm"
          loading={creatingPullRequest}
          leftIcon={!creatingPullRequest ? <GitPullRequest /> : undefined}
          onClick={onCreatePullRequest}
        >
          Create PR
        </Button>
      </div>

      {prStatus ? (
        <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm text-foreground">
          {prStatus}
        </div>
      ) : null}

      <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">PR title</p>
        <p className="mt-3 text-sm font-medium text-foreground">{review.prDraft.title}</p>
      </div>

      <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">PR body</p>
        <CodeBlock code={review.prDraft.body} maxHeight={520} />
      </div>
    </div>
  )
}
