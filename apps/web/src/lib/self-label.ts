/**
 * Self-labeling + content-label resolution (exploration 0175).
 *
 * Author self-labels are the cheapest, highest-precision sensitivity signal.
 * `useSelfLabel` writes a ModerationLabel node (sourceType 'user', weight 0.5);
 * `useContentLabels` reads the labels on a node and maps them to the
 * `@xnetjs/abuse` `AbuseLabel` shape consumed by the render gate.
 */
import type { AbuseLabel } from '@xnetjs/abuse'
import { SENSITIVITY_SOURCE_WEIGHT, type SensitivityLabelValue } from '@xnetjs/abuse'
import { ModerationLabelSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useCallback, useMemo } from 'react'

type Row = Record<string, unknown>

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Map a persisted ModerationLabel node to an in-memory AbuseLabel. */
export function moderationRowToAbuseLabel(row: Row): AbuseLabel {
  return {
    id: str(row.id),
    value: String(row.value ?? ''),
    sourceDID: str(row.sourceDID),
    sourceWeight: num(row.sourceWeight, 1),
    confidence: num(row.confidence, 1),
    expiresAt: typeof row.expiresAt === 'number' ? row.expiresAt : undefined,
    negates: str(row.negates)
  }
}

export function useContentLabels(targetId: string | undefined): AbuseLabel[] {
  const { data } = useQuery(ModerationLabelSchema, targetId ? { where: { target: targetId } } : {})
  return useMemo(() => {
    if (!targetId) return []
    return ((data ?? []) as unknown as Row[])
      .filter((row) => str(row.target) === targetId)
      .map(moderationRowToAbuseLabel)
  }, [data, targetId])
}

export interface SelfLabelController {
  selfLabel: (targetId: string, value: SensitivityLabelValue) => Promise<void>
}

export function useSelfLabel(): SelfLabelController {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const me = authorDID ?? ''

  const selfLabel = useCallback(
    async (targetId: string, value: SensitivityLabelValue) => {
      if (!bridge || !me) return
      await bridge.create(ModerationLabelSchema, {
        target: targetId,
        value,
        sourceDID: me as `did:key:${string}`,
        sourceType: 'user',
        confidence: 1,
        sourceWeight: SENSITIVITY_SOURCE_WEIGHT.self
      })
    },
    [bridge, me]
  )

  return { selfLabel }
}
