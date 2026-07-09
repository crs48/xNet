/**
 * Labeler subscriptions (exploration 0177, W3).
 *
 * Persist a subscription to a moderation labeler (its DID + a trust weight) as a
 * `PolicySubscription` node, and project the subscriber's active subscriptions
 * onto runtime `LabelerTrustSetting`s via the `@xnetjs/abuse` adapter — the seam
 * `evaluateLabelerTrust` consults when deciding whether a labeler's labels count.
 *
 * The pure row→view and view→trust mappings live as exported helpers so they can
 * be unit-tested without a data bridge.
 */
import {
  subscriptionsToTrustSettings,
  type LabelerTrustSetting,
  type PolicySubscriptionTrustInput
} from '@xnetjs/abuse'
import { PolicySubscriptionSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useCallback, useMemo } from 'react'

type Row = Record<string, unknown>

export interface LabelerSubscriptionView {
  id: string
  labelerDID: string
  trust: number
  enabled: boolean
  scope: string
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Map a persisted PolicySubscription node to the view the UI/adapter consume. */
export function rowToSubscriptionView(row: Row): LabelerSubscriptionView {
  return {
    id: String(row.id ?? ''),
    labelerDID: str(row.policyList) ?? '',
    trust: num(row.trust, 0.5),
    enabled: row.enabled !== false,
    scope: str(row.scope) ?? 'community'
  }
}

/** Project subscription views onto runtime trust settings (drops the expired). */
export function viewsToTrustSettings(
  views: readonly LabelerSubscriptionView[],
  scopeId: string,
  now = Date.now()
): LabelerTrustSetting[] {
  const inputs: PolicySubscriptionTrustInput[] = views.map((view) => ({
    labelerDID: view.labelerDID,
    trust: view.trust,
    enabled: view.enabled,
    scope: view.scope
  }))
  return subscriptionsToTrustSettings(inputs, scopeId, now)
}

export interface LabelerSubscriptionsController {
  subscriptions: LabelerSubscriptionView[]
  /** Active subscriptions projected to runtime trust settings. */
  trustSettings: LabelerTrustSetting[]
  /**
   * Whether `subscribe` can actually persist — the data bridge and the viewer's
   * identity are both ready. `subscribe` silently no-ops until this is true, so the
   * UI must gate the control on it (otherwise an early click is dropped and nothing
   * renders — the source of an e2e flake under load).
   */
  ready: boolean
  subscribe: (labelerDID: string, trust: number) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  unsubscribe: (id: string) => Promise<void>
}

export function useLabelerSubscriptions(): LabelerSubscriptionsController {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const me = authorDID ?? ''
  const { data } = useQuery(PolicySubscriptionSchema, {})

  const subscriptions = useMemo<LabelerSubscriptionView[]>(
    () =>
      ((data ?? []) as unknown as Row[])
        .filter((row) => str(row.subscriber) === me)
        .map(rowToSubscriptionView),
    [data, me]
  )

  const trustSettings = useMemo(
    () => viewsToTrustSettings(subscriptions, me || 'local'),
    [subscriptions, me]
  )

  const subscribe = useCallback(
    async (labelerDID: string, trust: number) => {
      const did = labelerDID.trim()
      if (!bridge || !me || did.length === 0) return
      await bridge.create(PolicySubscriptionSchema, {
        policyList: did,
        subscriber: me as `did:key:${string}`,
        scope: 'community',
        trust: Math.min(1, Math.max(0, trust)),
        enabled: true,
        localOverride: true
      })
    },
    [bridge, me]
  )

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      if (!bridge) return
      await bridge.update(id, { enabled })
    },
    [bridge]
  )

  const unsubscribe = useCallback(
    async (id: string) => {
      if (!bridge) return
      await bridge.delete(id)
    },
    [bridge]
  )

  const ready = Boolean(bridge) && me.length > 0

  return { subscriptions, trustSettings, ready, subscribe, setEnabled, unsubscribe }
}
