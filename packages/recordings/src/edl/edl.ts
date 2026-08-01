/**
 * The edit decision list (exploration 0414).
 *
 * Every edit a user makes to a recording is a span the timeline skips, never a
 * rewrite of the source. That choice buys three things at once: an "auto-edit"
 * is a JSON write instead of a minutes-long re-encode, undo is a boolean flip,
 * and the edit syncs as a few hundred bytes of LWW data rather than a fresh
 * video blob per revision.
 *
 * Two timelines therefore exist and must never be confused:
 *
 * - **source** — offsets into the recorded file. Transcript segments, chapters
 *   and cuts are all stored here, because they stay valid when cuts change.
 * - **edited** — what the viewer sees, with enabled cuts removed. Only the
 *   player and the scrubber speak this.
 *
 * `sourceToEdited` / `editedToSource` are the only sanctioned bridge. A bug in
 * either shows up as captions drifting out of sync, so both are exhaustively
 * tested.
 */

import type { Cut } from '@xnetjs/data'

/** A half-open span `[startMs, endMs)` on some timeline. */
export interface Span {
  startMs: number
  endMs: number
}

/**
 * The enabled cuts, sorted and merged so overlapping proposals cannot
 * double-count. Everything else in this module consumes the result, so
 * overlapping input is normalized exactly once.
 */
export function activeCuts(cuts: readonly Cut[]): Span[] {
  const sorted = cuts
    .filter((cut) => cut.enabled && cut.endMs > cut.startMs)
    .map((cut) => ({ startMs: cut.startMs, endMs: cut.endMs }))
    .sort((a, b) => a.startMs - b.startMs)

  const merged: Span[] = []
  for (const span of sorted) {
    const last = merged[merged.length - 1]
    if (last && span.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, span.endMs)
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

/** Total milliseconds removed by the enabled cuts. */
export function removedMs(cuts: readonly Cut[]): number {
  return activeCuts(cuts).reduce((total, span) => total + (span.endMs - span.startMs), 0)
}

/** How long the recording plays after cuts — what the scrubber shows. */
export function editedDurationMs(sourceDurationMs: number, cuts: readonly Cut[]): number {
  return Math.max(0, sourceDurationMs - removedMs(cuts))
}

/**
 * Map a source offset onto the edited timeline.
 *
 * A position *inside* a cut has no edited counterpart; it collapses onto the
 * cut's start, which is where playback resumes. Returning a plausible-looking
 * interior value instead would make captions inside a cut appear to be
 * showing at a real time (root AGENTS.md: absent and unreadable must differ —
 * `isCut` is how a caller tells them apart).
 */
export function sourceToEdited(
  sourceMs: number,
  cuts: readonly Cut[]
): { editedMs: number; isCut: boolean } {
  let removed = 0
  for (const span of activeCuts(cuts)) {
    if (sourceMs < span.startMs) break
    if (sourceMs < span.endMs) {
      return { editedMs: Math.max(0, span.startMs - removed), isCut: true }
    }
    removed += span.endMs - span.startMs
  }
  return { editedMs: Math.max(0, sourceMs - removed), isCut: false }
}

/** Map an edited offset back onto the source timeline. Always well-defined. */
export function editedToSource(editedMs: number, cuts: readonly Cut[]): number {
  let sourceMs = editedMs
  for (const span of activeCuts(cuts)) {
    if (span.startMs > sourceMs) break
    sourceMs += span.endMs - span.startMs
  }
  return sourceMs
}

/**
 * The cut containing `sourceMs`, if any — the player's `timeupdate` hook.
 * Seeking past a cut is cheaper than decoding frames nobody will see.
 */
export function cutAt(sourceMs: number, cuts: readonly Cut[]): Span | null {
  return activeCuts(cuts).find((span) => sourceMs >= span.startMs && sourceMs < span.endMs) ?? null
}

/**
 * Where playback should jump given a source position, or `null` to keep
 * playing. Chained cuts collapse into one jump because `activeCuts` merges
 * adjacent spans first.
 */
export function nextPlayheadMs(sourceMs: number, cuts: readonly Cut[]): number | null {
  const span = cutAt(sourceMs, cuts)
  return span ? span.endMs : null
}

/** The spans that survive the cuts — what an export renders, in order. */
export function keptSpans(sourceDurationMs: number, cuts: readonly Cut[]): Span[] {
  const kept: Span[] = []
  let cursor = 0
  for (const span of activeCuts(cuts)) {
    if (span.startMs > cursor)
      kept.push({ startMs: cursor, endMs: Math.min(span.startMs, sourceDurationMs) })
    cursor = Math.max(cursor, span.endMs)
    if (cursor >= sourceDurationMs) break
  }
  if (cursor < sourceDurationMs) kept.push({ startMs: cursor, endMs: sourceDurationMs })
  return kept.filter((span) => span.endMs > span.startMs)
}

/** A summary for the cut inspector — never remove time without saying so. */
export interface CutSummary {
  /** Number of enabled cuts, after merging overlaps. */
  count: number
  /** Total milliseconds removed. */
  removedMs: number
  /** Per-reason breakdown, so "23 silences, 4 fillers" is stateable. */
  byReason: Record<string, { count: number; removedMs: number }>
}

export function summarizeCuts(cuts: readonly Cut[]): CutSummary {
  const byReason: CutSummary['byReason'] = {}
  for (const cut of cuts) {
    if (!cut.enabled || cut.endMs <= cut.startMs) continue
    const bucket = (byReason[cut.reason] ??= { count: 0, removedMs: 0 })
    bucket.count += 1
    bucket.removedMs += cut.endMs - cut.startMs
  }
  const merged = activeCuts(cuts)
  return {
    count: merged.length,
    removedMs: merged.reduce((total, span) => total + (span.endMs - span.startMs), 0),
    byReason
  }
}

/**
 * Add a manual cut. Manual edits do not merge into machine proposals — each
 * stays individually restorable, which is the whole point of keeping disabled
 * cuts in the list.
 */
export function addManualCut(cuts: readonly Cut[], span: Span): Cut[] {
  if (span.endMs <= span.startMs) return [...cuts]
  return [...cuts, { startMs: span.startMs, endMs: span.endMs, reason: 'manual', enabled: true }]
}

/** Toggle one cut by index. Out-of-range indices are a no-op, not a throw. */
export function toggleCut(cuts: readonly Cut[], index: number, enabled?: boolean): Cut[] {
  return cuts.map((cut, i) => (i === index ? { ...cut, enabled: enabled ?? !cut.enabled } : cut))
}

/** Disable every cut — the "show me the original" escape hatch. */
export function restoreAll(cuts: readonly Cut[]): Cut[] {
  return cuts.map((cut) => ({ ...cut, enabled: false }))
}
