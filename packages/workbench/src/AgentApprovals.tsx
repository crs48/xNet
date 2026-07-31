/**
 * The shell-level approvals layer (0414).
 *
 * A high or critical agent action carries no chat code by design: only an xNet
 * surface can release it. Until this existed there was no such surface for a
 * *bridged* agent — Claude Code would call `xnet_compose_page`, the action
 * parked in the main-process recorder, the agent honestly reported "awaiting
 * in-app approval", and the app showed nothing at all. Five minutes later it
 * expired and the page was never written.
 *
 * It lives in the shell rather than the AI panel for the same reason it exists:
 * the decision must be reachable. The agent driving the workspace is often not
 * the panel — it is a coding agent in a terminal — so an approval that only
 * renders inside a chat panel is one closed panel away from being lost again.
 *
 * The host supplies the transport (desktop: IPC to the MCP server that owns the
 * parked action). Where `capabilities.agentBridge` is false, this renders
 * nothing and costs nothing.
 */

import type { ParkedApproval } from '@xnetjs/plugins'
import { useIdentity } from '@xnetjs/react'
import { useCallback, useEffect, useState, type JSX } from 'react'
import { usePlatform } from './platform'
import { ApprovalCard } from './views/ApprovalCard'

/**
 * The desktop preload's parked-approval channel. Mirrors
 * `apps/electron/src/preload/index.ts`; kept structural so the workbench does
 * not depend on the Electron surface.
 */
export interface AgentApprovalBridge {
  pendingApprovals(): Promise<ParkedApproval[]>
  approveAction(actionId: string, approverDID: string): Promise<boolean>
  denyAction(actionId: string, approverDID?: string): Promise<boolean>
  onPendingApprovalsChanged(handler: (parked: ParkedApproval[]) => void): () => void
}

/** Daemon control, the other half of the same preload namespace. */
export interface AgentBridgeControl {
  start: (agent?: string) => Promise<unknown>
  /** Current daemon status, including the pairing token (IPC only, never HTTP). */
  status?: () => Promise<{ running?: boolean; token?: string } | undefined>
}

declare global {
  interface Window {
    /**
     * One declaration for the whole namespace. The approval half is optional
     * because an older preload will not have it — `readBridge` checks rather
     * than assuming.
     */
    xnetAgentBridge?: AgentBridgeControl & Partial<AgentApprovalBridge>
  }
}

/** The bridge, or null when the host has no agent bridge or an older preload. */
function readBridge(enabled: boolean): AgentApprovalBridge | null {
  if (!enabled || typeof window === 'undefined') return null
  const bridge = window.xnetAgentBridge
  // Every method is required: a partial bridge would render cards that cannot
  // be acted on, which is a worse failure than rendering none.
  if (
    !bridge?.pendingApprovals ||
    !bridge.approveAction ||
    !bridge.denyAction ||
    !bridge.onPendingApprovalsChanged
  ) {
    return null
  }
  return bridge as AgentApprovalBridge
}

export function AgentApprovalsLayer(): JSX.Element | null {
  const { capabilities } = usePlatform()
  const { did: operatorDID } = useIdentity()
  const [bridge] = useState(() => readBridge(capabilities.agentBridge))
  const [parked, setParked] = useState<ParkedApproval[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bridge) return
    let live = true
    // Seed from the current list as well as subscribing: an action can park
    // before this mounts (the bridge starts before the window) and the push
    // event for it is long gone.
    void bridge
      .pendingApprovals()
      .then((initial) => {
        if (live) setParked(initial)
      })
      .catch(() => undefined)
    const unsubscribe = bridge.onPendingApprovalsChanged((next) => {
      if (live) setParked(next)
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [bridge])

  const decide = useCallback(
    async (actionId: string, approve: boolean) => {
      if (!bridge) return
      setError(null)
      try {
        const acted = approve
          ? await bridge.approveAction(actionId, operatorDID ?? 'did:unknown:operator')
          : await bridge.denyAction(actionId, operatorDID ?? undefined)
        // `false` means nothing was parked under that id — already decided, or
        // expired while the card was on screen. Say so rather than letting the
        // card vanish as if the click had worked.
        if (!acted) {
          setError('That action is no longer waiting — it expired or was already decided.')
          setParked((prev) => prev.filter((entry) => entry.actionId !== actionId))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [bridge, operatorDID]
  )

  if (!bridge || (parked.length === 0 && !error)) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="region"
      aria-label="Agent actions awaiting approval"
      data-testid="agent-approvals-layer"
    >
      {error ? (
        <div className="pointer-events-auto rounded-lg border border-hairline bg-surface-0 px-2.5 py-2 text-[11px] text-rose-500 shadow-2xl">
          {error}
        </div>
      ) : null}
      {parked.map((pending) => (
        <div
          key={pending.actionId}
          className="pointer-events-auto rounded-lg bg-surface-0 shadow-2xl"
        >
          <ApprovalCard
            pending={pending}
            operatorDID={operatorDID}
            origin="agent bridge"
            onApprove={() => void decide(pending.actionId, true)}
            onDeny={() => void decide(pending.actionId, false)}
          />
        </div>
      ))}
    </div>
  )
}
