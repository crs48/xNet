/**
 * Trust-gated content labels (exploration 0177, W3 render-gate consumption).
 *
 * The render gate must not let *any* labeler filter your content — only ones
 * you've subscribed to, at the weight you chose. This applies the viewer's
 * runtime `LabelerTrustSetting`s (from `useLabelerSubscriptions`) to a node's
 * `ModerationLabel` rows: labels from a `labeler`/`policy-list` source are kept
 * only if `evaluateLabelerTrust` accepts them (i.e. you're subscribed and the
 * label clears your confidence floor), re-weighted by the subscription's trust;
 * self/AI/report labels pass through untouched. It also surfaces which labelers
 * contributed, for "filtered by X" attribution.
 */
import { evaluateLabelerTrust, type AbuseLabel, type LabelerTrustSetting } from '@xnetjs/abuse'
import { ModerationLabelSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useMemo } from 'react'
import { useLabelerSubscriptions } from './labeler-subscriptions'
import { moderationRowToAbuseLabel } from './self-label'

type Row = Record<string, unknown>

/** Sources whose labels require a viewer subscription to count. */
const LABELER_SOURCE_TYPES = new Set(['labeler', 'policy-list'])

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export interface LabelAttribution {
  labelerDID: string
  value: string
}

export interface TrustedContentLabels {
  labels: AbuseLabel[]
  /** Labelers (and the values they applied) that passed trust and contributed. */
  attributions: LabelAttribution[]
}

const EMPTY: TrustedContentLabels = { labels: [], attributions: [] }

/**
 * Gate a node's moderation-label rows through the viewer's labeler trust (pure).
 * Labeler/policy-list labels survive only when subscribed-and-accepted; their
 * weight becomes the subscription's effective trust weight.
 */
export function applyLabelerTrustToRows(
  rows: readonly Row[],
  trustSettings: readonly LabelerTrustSetting[],
  scopeId: string,
  now = Date.now()
): TrustedContentLabels {
  const labels: AbuseLabel[] = []
  const attributions: LabelAttribution[] = []
  for (const row of rows) {
    const label = moderationRowToAbuseLabel(row)
    const sourceType = str(row.sourceType)
    if (!sourceType || !LABELER_SOURCE_TYPES.has(sourceType)) {
      labels.push(label)
      continue
    }
    const labelerDID = label.sourceDID
    if (!labelerDID) continue
    const decision = evaluateLabelerTrust(
      {
        scope: 'workspace',
        scopeId,
        labelerDID,
        labelValue: label.value,
        confidence: label.confidence,
        labelExpiresAt: label.expiresAt,
        now
      },
      trustSettings
    )
    if (!decision.accepted) continue
    labels.push({ ...label, sourceWeight: decision.effectiveWeight })
    attributions.push({ labelerDID, value: label.value })
  }
  return { labels, attributions }
}

/**
 * Group label rows by target (restricted to `targetIds`) and trust-gate each
 * group — the pure core of `useTrustedContentLabelsBatch`, extracted so it's
 * testable without a data bridge.
 */
export function groupTrustedLabelsByTarget(
  rows: readonly Row[],
  targetIds: Iterable<string>,
  trustSettings: readonly LabelerTrustSetting[],
  scopeId: string,
  now = Date.now()
): Map<string, TrustedContentLabels> {
  const wanted = new Set(targetIds)
  const byTarget = new Map<string, Row[]>()
  for (const row of rows) {
    const target = str(row.target)
    if (!target || !wanted.has(target)) continue
    const list = byTarget.get(target) ?? []
    list.push(row)
    byTarget.set(target, list)
  }
  const result = new Map<string, TrustedContentLabels>()
  for (const [target, group] of byTarget) {
    result.set(target, applyLabelerTrustToRows(group, trustSettings, scopeId, now))
  }
  return result
}

/** Short "via <labeler>" attribution string, or undefined when none. */
export function attributionText(attributions: readonly LabelAttribution[]): string | undefined {
  if (attributions.length === 0) return undefined
  const dids = [...new Set(attributions.map((a) => a.labelerDID))]
  const shown = dids.slice(0, 2).map((did) => `${did.slice(0, 14)}…`)
  const extra = dids.length > shown.length ? ` +${dids.length - shown.length}` : ''
  return `via ${shown.join(', ')}${extra}`
}

/** A node's labels, trust-gated against the viewer's labeler subscriptions. */
export function useTrustedContentLabels(targetId: string | undefined): TrustedContentLabels {
  const { data } = useQuery(ModerationLabelSchema, targetId ? { where: { target: targetId } } : {})
  const { trustSettings } = useLabelerSubscriptions()
  const { authorDID } = useXNet()
  const scopeId = authorDID ?? 'local'

  return useMemo(() => {
    if (!targetId) return EMPTY
    const rows = ((data ?? []) as unknown as Row[]).filter((row) => str(row.target) === targetId)
    return applyLabelerTrustToRows(rows, trustSettings, scopeId)
  }, [data, targetId, trustSettings, scopeId])
}

/**
 * Batched trust-gated labels for a set of node ids — one query, grouped by
 * target, then trust-applied per target. The feed/thread analogue of
 * `useTrustedContentLabels` (mirrors `useContentLabelsBatch`).
 */
export function useTrustedContentLabelsBatch(
  targetIds: readonly string[]
): Map<string, TrustedContentLabels> {
  const { data } = useQuery(ModerationLabelSchema, {})
  const { trustSettings } = useLabelerSubscriptions()
  const { authorDID } = useXNet()
  const scopeId = authorDID ?? 'local'
  const wanted = useMemo(() => [...targetIds], [targetIds])

  return useMemo(
    () =>
      groupTrustedLabelsByTarget((data ?? []) as unknown as Row[], wanted, trustSettings, scopeId),
    [data, wanted, trustSettings, scopeId]
  )
}
