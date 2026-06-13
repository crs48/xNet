/**
 * ModeratedNode (exploration 0175) — the wired render gate for a stored node.
 *
 * Resolves a node's persisted sensitivity labels and renders its children
 * through the viewer's dial. Any surface (feed item, chat message, match media)
 * wraps content in this to inherit one consistent filter.
 */
import type { AbuseVisibility } from '@xnetjs/abuse'
import * as React from 'react'
import { attributionText, useTrustedContentLabels } from '../lib/content-labels-trust'
import { ModeratedContent } from './ModeratedContent'

export interface ModeratedNodeProps {
  /** Node id whose ModerationLabels gate this content. */
  targetId: string | undefined
  platformVisibility?: AbuseVisibility
  unsolicitedMedia?: boolean
  hiddenPlaceholder?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function ModeratedNode({
  targetId,
  platformVisibility,
  unsolicitedMedia,
  hiddenPlaceholder,
  className,
  children
}: ModeratedNodeProps) {
  const { labels, attributions } = useTrustedContentLabels(targetId)
  return (
    <ModeratedContent
      labels={labels}
      platformVisibility={platformVisibility}
      unsolicitedMedia={unsolicitedMedia}
      attribution={attributionText(attributions)}
      hiddenPlaceholder={hiddenPlaceholder}
      className={className}
    >
      {children}
    </ModeratedContent>
  )
}
