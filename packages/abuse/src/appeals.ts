/**
 * Appeal effects for automated moderation decisions.
 */

import type { AbuseLabel } from './types'

// ─── Types ─────────────────────────────────────────────────

export type AppealStatus = 'open' | 'accepted' | 'rejected' | 'needs-info'
export type AppealResolutionAction = 'reverse' | 'annotate'
export type AppealEffectAction = 'none' | 'reverse' | 'annotate'

export type AppealEffectInput = {
  appealId: string
  targetId: string
  appellantDID: string
  status: AppealStatus
  action?: AppealResolutionAction
  reviewerDID?: string
  decisionId?: string
  appealedLabelId?: string
  resolution?: string
  evidenceRefs?: readonly string[]
  confidence?: number
  sourceWeight?: number
  expiresAt?: number
}

export type AppealAnnotation = {
  appealId: string
  targetId: string
  status: AppealStatus
  action: AppealEffectAction
  appellantDID: string
  reviewerDID?: string
  decisionId?: string
  appealedLabelId?: string
  resolution?: string
  evidenceRefs: readonly string[]
}

export type AppealEffect = {
  action: AppealEffectAction
  annotation: AppealAnnotation
  labelsToApply: readonly AbuseLabel[]
  reasons: readonly string[]
}

// ─── Public API ────────────────────────────────────────────

export function createAppealEffect(input: AppealEffectInput): AppealEffect {
  const evidenceRefs = createAppealEvidenceRefs(input)
  const baseAnnotation: AppealAnnotation = {
    appealId: input.appealId,
    targetId: input.targetId,
    status: input.status,
    action: resolveAppealEffectAction(input),
    appellantDID: input.appellantDID,
    reviewerDID: input.reviewerDID,
    decisionId: input.decisionId,
    appealedLabelId: input.appealedLabelId,
    resolution: input.resolution,
    evidenceRefs
  }

  if (baseAnnotation.action !== 'reverse') {
    return {
      action: baseAnnotation.action,
      annotation: baseAnnotation,
      labelsToApply: [],
      reasons: createAppealReasons(baseAnnotation)
    }
  }

  return {
    action: 'reverse',
    annotation: baseAnnotation,
    labelsToApply: [
      {
        id: `appeal-reversal:${input.appealId}`,
        value: 'safe',
        sourceDID: input.reviewerDID,
        sourceWeight: clamp(input.sourceWeight ?? 1, 0, 10),
        confidence: clamp(input.confidence ?? 1, 0, 1),
        expiresAt: input.expiresAt,
        evidenceRefs,
        negates: input.appealedLabelId
      }
    ],
    reasons: createAppealReasons(baseAnnotation)
  }
}

// ─── Helpers ───────────────────────────────────────────────

function resolveAppealEffectAction(input: AppealEffectInput): AppealEffectAction {
  if (input.status !== 'accepted') {
    return input.status === 'rejected' ? 'annotate' : 'none'
  }

  if (input.action !== 'reverse') return 'annotate'
  if (!input.reviewerDID || !input.appealedLabelId) return 'annotate'
  return 'reverse'
}

function createAppealEvidenceRefs(input: AppealEffectInput): readonly string[] {
  return [
    `appeal:${input.appealId}`,
    input.decisionId ? `decision:${input.decisionId}` : null,
    input.appealedLabelId ? `label:${input.appealedLabelId}` : null,
    ...(input.evidenceRefs ?? [])
  ].filter((ref): ref is string => ref !== null)
}

function createAppealReasons(annotation: AppealAnnotation): readonly string[] {
  return [
    `appeal:${annotation.status}`,
    annotation.action === 'reverse' ? 'appeal:reversal-label' : null,
    annotation.action === 'annotate' ? 'appeal:annotation-only' : null,
    annotation.action === 'none' ? 'appeal:no-effect' : null
  ].filter((reason): reason is string => reason !== null)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
