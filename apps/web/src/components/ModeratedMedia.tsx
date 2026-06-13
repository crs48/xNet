/**
 * ModeratedMedia / ModeratedPost (exploration 0176) — the shared render gate.
 *
 * Thin wrappers over ModeratedNode/ModeratedContent so EVERY surface routes
 * content through one veil: pass `labels` (from a batched lookup in a feed/thread)
 * or `nodeId` (self-fetch for a single item). Wiring once here means a future
 * surface can't accidentally ship unfiltered media.
 */
import type { AbuseLabel } from '@xnetjs/abuse'
import * as React from 'react'
import { ModeratedContent } from './ModeratedContent'
import { ModeratedNode } from './ModeratedNode'

interface BaseProps {
  /** Pre-fetched labels (preferred in feeds/threads via useContentLabelsBatch). */
  labels?: readonly AbuseLabel[]
  /** Node id to self-fetch labels for, when not batched. */
  nodeId?: string
  /** Media from a non-mutual sender → blur by default (0174 dating rule). */
  unsolicitedMedia?: boolean
  className?: string
  children: React.ReactNode
}

function Gate({
  labels,
  nodeId,
  unsolicitedMedia,
  className,
  hiddenPlaceholder,
  children
}: BaseProps & { hiddenPlaceholder?: React.ReactNode }) {
  if (labels) {
    return (
      <ModeratedContent
        labels={labels}
        unsolicitedMedia={unsolicitedMedia}
        hiddenPlaceholder={hiddenPlaceholder}
        className={className}
      >
        {children}
      </ModeratedContent>
    )
  }
  return (
    <ModeratedNode
      targetId={nodeId}
      unsolicitedMedia={unsolicitedMedia}
      hiddenPlaceholder={hiddenPlaceholder}
      className={className}
    >
      {children}
    </ModeratedNode>
  )
}

const HIDDEN_MEDIA = (
  <span className="inline-flex items-center rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
    🛡 Media hidden by your filters
  </span>
)

/** Gate media (images/attachments) — hidden state shows a compact placeholder chip. */
export function ModeratedMedia(props: BaseProps) {
  return <Gate {...props} hiddenPlaceholder={HIDDEN_MEDIA} />
}

/** Gate a post/message body — hidden state renders nothing. */
export function ModeratedPost(props: BaseProps) {
  return <Gate {...props} />
}
