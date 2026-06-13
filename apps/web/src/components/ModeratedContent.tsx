/**
 * ModeratedContent — the app-level render gate (exploration 0175).
 *
 * Joins a piece of content's sensitivity labels to the viewer's dial and renders
 * the shared `<SensitiveContent>` veil. Feeds, DMs, and the matching surface wrap
 * media/posts in this so one filter governs the whole app. Platform-level
 * abuse decisions (spam/malware → hide for everyone) can be passed in via
 * `platformVisibility`; the stricter of the two wins.
 */
import {
  assessSensitivity,
  resolveContentVisibility,
  type AbuseLabel,
  type AbuseVisibility
} from '@xnetjs/abuse'
import { SensitiveContent } from '@xnetjs/ui'
import * as React from 'react'
import { useMemo } from 'react'
import { useSensitivityPreferences } from '../lib/sensitivity-preferences'

export interface ModeratedContentProps {
  /** Sensitivity labels attached to this content. */
  labels: readonly AbuseLabel[]
  /** Platform decision (default 'show'); the stricter of platform/viewer wins. */
  platformVisibility?: AbuseVisibility
  /** Dating signal: media from a non-mutual sender → blur by default (0174). */
  unsolicitedMedia?: boolean
  hiddenPlaceholder?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function ModeratedContent({
  labels,
  platformVisibility = 'show',
  unsolicitedMedia,
  hiddenPlaceholder,
  className,
  children
}: ModeratedContentProps) {
  const { preferences } = useSensitivityPreferences()

  const { visibility, presentLabels } = useMemo(() => {
    const present = assessSensitivity(labels).values
    const resolved = resolveContentVisibility({ visibility: platformVisibility }, labels, preferences, {
      unsolicitedMedia
    })
    return { visibility: resolved, presentLabels: present }
  }, [labels, platformVisibility, preferences, unsolicitedMedia])

  return (
    <SensitiveContent
      visibility={visibility}
      labels={presentLabels}
      hiddenPlaceholder={hiddenPlaceholder}
      className={className}
    >
      {children}
    </SensitiveContent>
  )
}
