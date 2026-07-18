/**
 * Agent audit console hook (exploration 0337).
 *
 * Reads the agent audit trail — `AgentAction` nodes plus their
 * `AgentApproval` decisions and `AgentSession` context — straight from the
 * store, live via `store.subscribe` (debounced, no polling). Filterable by
 * agent DID (`createdBy`), so "everything agent X did" is one click.
 */

import type { NodeState, NodeStore } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'

const ACTION_IRI = 'xnet://xnet.fyi/AgentAction@1.0.0'
const APPROVAL_IRI = 'xnet://xnet.fyi/AgentApproval@1.0.0'
const SESSION_IRI = 'xnet://xnet.fyi/AgentSession@1.0.0'
const PASSPORT_IRI = 'xnet://xnet.fyi/AgentPassport@1.0.0'

const LIVE_DEBOUNCE_MS = 250
const LIST_LIMIT = 500

export type AgentActionRow = {
  id: string
  createdAt: number
  agentDID: string
  session: string
  channel: string
  tool: string
  instruction: string
  risk: string
  status: string
  reversibility: string
  changeIds: string[]
  error: string | null
  approval: {
    surface: string
    decision: string
    approverDID: string | null
    peer: string | null
  } | null
}

export type AgentAuditState = {
  rows: AgentActionRow[]
  agents: string[]
  agentFilter: string | null
  setAgentFilter: (did: string | null) => void
  passports: Array<{ agentDID: string; displayName: string; runtime: string; status: string }>
  loading: boolean
  selected: AgentActionRow | null
  setSelectedId: (id: string | null) => void
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const buildRows = (
  actions: NodeState[],
  approvals: NodeState[],
  sessions: NodeState[]
): AgentActionRow[] => {
  const approvalByAction = new Map(
    approvals.map((a) => [str(a.properties.action), a] as const)
  )
  const sessionById = new Map(sessions.map((s) => [s.id, s] as const))

  return actions
    .filter((n) => !n.deleted)
    .map((n) => {
      const approval = approvalByAction.get(n.id) ?? null
      const session = sessionById.get(str(n.properties.session))
      return {
        id: n.id,
        createdAt: Number(n.properties.createdAt ?? 0),
        agentDID: str(n.properties.createdBy, 'unknown'),
        session: str(n.properties.session),
        channel: str(session?.properties.channel, 'other'),
        tool: str(n.properties.tool),
        instruction: str(n.properties.instruction),
        risk: str(n.properties.risk, 'low'),
        status: str(n.properties.status, 'proposed'),
        reversibility: str(n.properties.reversibility, 'compensatable'),
        changeIds: Array.isArray(n.properties.changeIds)
          ? (n.properties.changeIds as string[])
          : [],
        error: typeof n.properties.error === 'string' ? n.properties.error : null,
        approval: approval
          ? {
              surface: str(approval.properties.surface),
              decision: str(approval.properties.decision),
              approverDID:
                typeof approval.properties.approverDID === 'string'
                  ? approval.properties.approverDID
                  : null,
              peer:
                typeof approval.properties.peer === 'string' ? approval.properties.peer : null
            }
          : null
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

async function loadAudit(store: NodeStore) {
  const [actions, approvals, sessions, passports] = await Promise.all([
    store.list({ schemaId: ACTION_IRI, limit: LIST_LIMIT }),
    store.list({ schemaId: APPROVAL_IRI, limit: LIST_LIMIT }),
    store.list({ schemaId: SESSION_IRI, limit: LIST_LIMIT }),
    store.list({ schemaId: PASSPORT_IRI, limit: 100 })
  ] as [Promise<NodeState[]>, Promise<NodeState[]>, Promise<NodeState[]>, Promise<NodeState[]>])
  return { actions, approvals, sessions, passports }
}

export function useAgentAudit(): AgentAuditState {
  const { store } = useDevTools()
  const [rows, setRows] = useState<AgentActionRow[]>([])
  const [passports, setPassports] = useState<AgentAuditState['passports']>([])
  const [agentFilter, setAgentFilter] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!store) return
    const { actions, approvals, sessions, passports: passportNodes } = await loadAudit(store)
    setRows(buildRows(actions, approvals, sessions))
    setPassports(
      passportNodes
        .filter((n) => !n.deleted)
        .map((n) => ({
          agentDID: str(n.properties.agentDID),
          displayName: str(n.properties.displayName),
          runtime: str(n.properties.runtime, 'other'),
          status: str(n.properties.status, 'active')
        }))
    )
    setLoading(false)
  }, [store])

  useEffect(() => {
    if (!store) return
    void refresh()
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = store.subscribe(() => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void refresh()
      }, LIVE_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [store, refresh])

  const agents = useMemo(
    () => [...new Set(rows.map((r) => r.agentDID))].sort(),
    [rows]
  )
  const filtered = useMemo(
    () => (agentFilter ? rows.filter((r) => r.agentDID === agentFilter) : rows),
    [rows, agentFilter]
  )
  const selected = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? null,
    [filtered, selectedId]
  )

  return {
    rows: filtered,
    agents,
    agentFilter,
    setAgentFilter,
    passports,
    loading,
    selected,
    setSelectedId
  }
}

export { buildRows }
