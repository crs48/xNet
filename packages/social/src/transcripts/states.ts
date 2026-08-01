/**
 * Counting what a transcript run actually did.
 *
 * The rule this module exists to enforce: a run is only "complete" when every
 * target it was given is accounted for by exactly one terminal state. A pass
 * that quietly stopped at video 40 of 200 must not read the same as one that
 * finished, and a library that was rate-limited must not read the same as a
 * library of videos that genuinely have no captions.
 */

import type { TranscriptFetchStatus } from './types'

/**
 * The state a single target is in.
 *
 * `not-attempted` is a first-class value, not the absence of one. It is what
 * separates "we have not looked yet" from "we looked and found nothing".
 */
export type TranscriptTargetState =
  | 'not-attempted'
  | 'fetched'
  | 'no-captions'
  | 'blocked'
  | 'error'

export const TRANSCRIPT_TARGET_STATES: readonly TranscriptTargetState[] = [
  'not-attempted',
  'fetched',
  'no-captions',
  'blocked',
  'error'
]

export type TranscriptRunSummary = {
  /** How many targets the run was given. */
  total: number
  notAttempted: number
  fetched: number
  noCaptions: number
  blocked: number
  errored: number
  /** Every target reached a terminal state. */
  complete: boolean
  /**
   * A retry could change the outcome — something was refused or failed, as
   * opposed to simply having no captions.
   */
  retryable: boolean
}

/** Map a stored `SocialEnrichment.status` back to a target state. */
export function transcriptStateForEnrichmentStatus(
  status: string | undefined
): TranscriptTargetState {
  switch (status) {
    case 'resolved':
      return 'fetched'
    case 'unavailable':
      return 'no-captions'
    case 'blocked':
      return 'blocked'
    case 'error':
      return 'error'
    default:
      return 'not-attempted'
  }
}

/** Map a live fetch outcome to a target state. */
export function transcriptStateForOutcome(status: TranscriptFetchStatus): TranscriptTargetState {
  return status === 'fetched' ? 'fetched' : status
}

/**
 * Summarize a run.
 *
 * `total` is the size of the target list the run was handed, which may exceed
 * the number of states supplied — anything unaccounted for counts as
 * `not-attempted` rather than vanishing from the tally. That is what makes the
 * counts sum to `total` and makes an interrupted run visible as one.
 */
export function summarizeTranscriptRun(input: {
  states: readonly TranscriptTargetState[]
  total?: number
}): TranscriptRunSummary {
  const counts: Record<TranscriptTargetState, number> = {
    'not-attempted': 0,
    fetched: 0,
    'no-captions': 0,
    blocked: 0,
    error: 0
  }

  for (const state of input.states) counts[state] += 1

  const total = Math.max(input.total ?? input.states.length, input.states.length)
  counts['not-attempted'] += total - input.states.length

  return {
    total,
    notAttempted: counts['not-attempted'],
    fetched: counts.fetched,
    noCaptions: counts['no-captions'],
    blocked: counts.blocked,
    errored: counts.error,
    complete: counts['not-attempted'] === 0,
    retryable: counts.blocked > 0 || counts.error > 0
  }
}

/**
 * A one-line, human-readable account of a run.
 *
 * Written to be quotable in a status panel: it always names the incomplete and
 * blocked cases rather than rounding them away.
 */
export function describeTranscriptRun(summary: TranscriptRunSummary): string {
  const parts = [`${summary.fetched} fetched`, `${summary.noCaptions} without captions`]
  if (summary.blocked > 0) parts.push(`${summary.blocked} blocked`)
  if (summary.errored > 0) parts.push(`${summary.errored} failed`)
  if (summary.notAttempted > 0) parts.push(`${summary.notAttempted} not attempted`)

  const status = summary.complete ? 'complete' : 'incomplete'
  return `${summary.total} videos, ${status}: ${parts.join(', ')}.`
}
