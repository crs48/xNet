/**
 * useSafetyActions (exploration 0176) — the per-person safety toolkit.
 *
 * Combines the viewer-local block/mute/restrict list with reporting (a synced
 * AbuseReport node). Surfaced by PersonActions on every person/post.
 */
import { AbuseReportSchema } from '@xnetjs/data'
import { useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useCallback } from 'react'
import { useBlockList, type BlockState } from '../lib/block-list'

/** AbuseReport categories used by the report UI — a subset of the label vocabulary. */
type ReportCategory =
  | 'harassment'
  | 'spam'
  | 'scam'
  | 'impersonation'
  | 'sexual'
  | 'porn'
  | 'graphic-media'
  | 'malware'

export interface SafetyActions {
  state: BlockState | null
  block: () => void
  mute: () => void
  restrict: () => void
  unblock: () => void
  report: (input: { category: string; reason: string; targetSchema?: string }) => Promise<void>
}

export function useSafetyActions(did: string): SafetyActions {
  const blocks = useBlockList()
  const bridge = useDataBridge()
  const me = useXNet().authorDID ?? ''

  const report = useCallback(
    async ({
      category,
      reason,
      targetSchema = 'person'
    }: {
      category: string
      reason: string
      targetSchema?: string
    }) => {
      if (!bridge || !me || !did) return
      await bridge.create(AbuseReportSchema, {
        target: did,
        targetSchema,
        reporter: me as `did:key:${string}`,
        category: category as ReportCategory,
        reason,
        status: 'open'
      })
    },
    [bridge, me, did]
  )

  return {
    state: blocks.stateOf(did),
    block: () => blocks.block(did),
    mute: () => blocks.mute(did),
    restrict: () => blocks.restrict(did),
    unblock: () => blocks.unblock(did),
    report
  }
}
