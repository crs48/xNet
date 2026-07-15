/**
 * Hooks sub-barrel (0276 barrel policy): NEW hook surface lands here as
 * named exports; the root barrel re-exports this area as ONE grouped block.
 * Pre-0276 hooks are still exported file-by-file from the root barrel —
 * migrate them here on touch, not as a campaign.
 */

// Time Machine (exploration 0329) — scrub, named versions, restore.
// The history types a scrubber UI needs are re-exported so app code can bind
// to the hook without depending on @xnetjs/history directly.
export {
  useTimeMachine,
  type UseTimeMachineOptions,
  type UseTimeMachineResult
} from './useTimeMachine'
export type {
  Frontier,
  FrontierEntry,
  HistoryHorizon,
  PropertyDiff,
  RestoreResult,
  ScopeTimelineEntry
} from '@xnetjs/history'

// Drafts (exploration 0329 P2/P3) — fork/checkout/review/merge, plus the
// merge-result types a switcher/review UI needs.
export {
  useDraft,
  type DraftReview,
  type DraftReviewCard,
  type DraftReviewMember,
  type UseDraftResult
} from './useDraft'
export type { DraftMergeConflict, MergeDraftResult, RefreshDraftResult } from '@xnetjs/history'
