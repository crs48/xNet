/**
 * AiChangeStatusBadge - compact state marker for in-app AI answers and changes.
 */

import type { AiAgentDisplayState, AiAgentDisplayStateKind } from '@xnetjs/plugins'
import { Bot, CheckCircle2, PencilLine, type LucideIcon } from 'lucide-react'
import React from 'react'

type AiChangeStatusBadgeSpec = {
  label: string
  description: string
  icon: LucideIcon
  className: string
}

const AI_CHANGE_STATUS_BADGE_SPECS: Record<AiAgentDisplayStateKind, AiChangeStatusBadgeSpec> = {
  'read-only-answer': {
    label: 'Read-only',
    description: 'Read-only answer',
    icon: Bot,
    className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900'
  },
  'proposed-change': {
    label: 'Proposed',
    description: 'Proposed change awaiting review',
    icon: PencilLine,
    className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950'
  },
  'applied-change': {
    label: 'Applied',
    description: 'Applied change with audit record',
    icon: CheckCircle2,
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950'
  }
}

export function getAiChangeStatusBadgeSpec(kind: AiAgentDisplayStateKind): AiChangeStatusBadgeSpec {
  return AI_CHANGE_STATUS_BADGE_SPECS[kind]
}

export function AiChangeStatusBadge({
  state,
  compact = false
}: {
  state: AiAgentDisplayState
  compact?: boolean
}): React.ReactElement {
  const spec = getAiChangeStatusBadgeSpec(state.kind)
  const Icon = spec.icon
  const label = state.label || spec.label

  return (
    <span
      className={[
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium',
        spec.className
      ].join(' ')}
      data-ai-state={state.kind}
      title={spec.description}
      aria-label={spec.description}
    >
      <Icon size={13} aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </span>
  )
}
