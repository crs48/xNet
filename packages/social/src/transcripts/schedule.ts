/**
 * Pacing a transcript pass.
 *
 * A watch history is thousands of videos. Fetched flat out from one address
 * that is a scrape; fetched at a human pace it is a person catching up on
 * their own library. The interval is the feature, not an apology for one.
 *
 * The other half is knowing when to stop. Once the endpoint starts refusing,
 * every further request is both useless and evidence against the user, so a
 * run gives up after a short streak of refusals — and reports itself as
 * incomplete, with the untried targets counted, rather than presenting a
 * truncated pass as a finished one.
 */

import type { TranscriptFetchOutcome, TranscriptFetcher, TranscriptTarget } from './types'
import type { TranscriptRunSummary, TranscriptTargetState } from './states'
import { summarizeTranscriptRun, transcriptStateForOutcome } from './states'

/** Milliseconds between attempts, before jitter. */
export const DEFAULT_TRANSCRIPT_INTERVAL_MS = 1_500

/** Extra milliseconds, drawn per attempt, so the cadence is not a metronome. */
export const DEFAULT_TRANSCRIPT_JITTER_MS = 1_000

/** Consecutive refusals after which a pass stops rather than pressing on. */
export const DEFAULT_MAX_CONSECUTIVE_BLOCKS = 3

export type TranscriptPassResult = {
  summary: TranscriptRunSummary
  /** Targets that were refused or failed, in the order they were attempted. */
  retryable: TranscriptTarget[]
  /** True when the pass gave up early on a streak of refusals. */
  stoppedEarly: boolean
}

export type TranscriptPassOptions = {
  targets: readonly TranscriptTarget[]
  fetcher: TranscriptFetcher
  /** Called for each attempt, in order. Errors here abort the pass. */
  onResult: (target: TranscriptTarget, outcome: TranscriptFetchOutcome) => void | Promise<void>
  intervalMs?: number
  jitterMs?: number
  maxConsecutiveBlocks?: number
  /** Injected for tests; defaults to `setTimeout`. */
  delayFn?: (ms: number) => Promise<void>
  /** Injected for tests; defaults to `Math.random`. */
  random?: () => number
  signal?: AbortSignal
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run one transcript pass over a target list.
 *
 * Unsupported targets are skipped without an attempt and stay `not-attempted`,
 * which is the honest reading: we did not look, because this fetcher cannot.
 */
export async function runTranscriptFetchPass(
  options: TranscriptPassOptions
): Promise<TranscriptPassResult> {
  const intervalMs = options.intervalMs ?? DEFAULT_TRANSCRIPT_INTERVAL_MS
  const jitterMs = options.jitterMs ?? DEFAULT_TRANSCRIPT_JITTER_MS
  const maxConsecutiveBlocks = options.maxConsecutiveBlocks ?? DEFAULT_MAX_CONSECUTIVE_BLOCKS
  const delayFn = options.delayFn ?? defaultDelay
  const random = options.random ?? Math.random

  const states: TranscriptTargetState[] = []
  const retryable: TranscriptTarget[] = []
  let consecutiveBlocks = 0
  let stoppedEarly = false
  let attempted = 0

  for (const target of options.targets) {
    if (options.signal?.aborted) {
      stoppedEarly = true
      break
    }
    if (!options.fetcher.supports(target)) continue

    if (attempted > 0) {
      await delayFn(intervalMs + Math.floor(random() * jitterMs))
    }
    attempted += 1

    const outcome = await options.fetcher.fetch(target, options.signal)
    states.push(transcriptStateForOutcome(outcome.status))
    await options.onResult(target, outcome)

    if (outcome.status === 'blocked' || outcome.status === 'error') {
      retryable.push(target)
    }

    if (outcome.status === 'blocked') {
      consecutiveBlocks += 1
      if (consecutiveBlocks >= maxConsecutiveBlocks) {
        stoppedEarly = true
        break
      }
    } else {
      consecutiveBlocks = 0
    }
  }

  return {
    summary: summarizeTranscriptRun({ states, total: options.targets.length }),
    retryable,
    stoppedEarly
  }
}
