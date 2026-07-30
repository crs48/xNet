/**
 * AuthZPanel - Authorization observability and controls.
 */

import {
  AUTH_ACTIONS,
  type AuthAction,
  type AuthGrant,
  type DID,
  type GrantInput
} from '@xnetjs/data'
import { useEffect, useMemo, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import { AUTHZ_TABS, type AuthZTab } from '../authz-config'
import { AuthTraceView, type AuthTrace } from './AuthTraceView'

const AUTHZ_TAB_LABELS: Record<AuthZTab, string> = {
  playground: 'Playground',
  grants: 'Grants',
  timeline: 'Timeline',
  delegation: 'Delegation',
  propagation: 'Propagation'
}

type GrantEventType = 'created' | 'revoked' | 'expired'

type GrantEvent = {
  id: string
  grantId: string
  type: GrantEventType
  resource: string
  grantee: DID
  actions: AuthAction[]
  timestamp: number
}

export function AuthZPanel() {
  const [activeTab, setActiveTab] = useState<AuthZTab>('playground')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-hairline shrink-0 overflow-x-auto">
        {AUTHZ_TABS.map((tab) => (
          <TabButton
            key={tab}
            id={tab}
            label={AUTHZ_TAB_LABELS[tab]}
            activeTab={activeTab}
            onSelect={setActiveTab}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'playground' && <PermissionPlayground />}
        {activeTab === 'grants' && <GrantManager />}
        {activeTab === 'timeline' && <GrantTimeline />}
        {activeTab === 'delegation' && <DelegationTreeExplorer />}
        {activeTab === 'propagation' && <RevocationPropagation />}
      </div>
    </div>
  )
}

function TabButton({
  id,
  label,
  activeTab,
  onSelect
}: {
  id: AuthZTab
  label: string
  activeTab: AuthZTab
  onSelect: (tab: AuthZTab) => void
}) {
  const isActive = activeTab === id
  return (
    <button
      onClick={() => onSelect(id)}
      className={`px-2 py-1 text-[10px] border rounded transition-colors ${
        isActive
          ? 'border-accent-ink bg-accent text-ink-1'
          : 'border-hairline text-ink-2 hover:text-ink-1'
      }`}
    >
      {label}
    </button>
  )
}

function PermissionPlayground() {
  const { store, activeNodeId } = useDevTools()
  const [nodeId, setNodeId] = useState(activeNodeId ?? '')
  const [action, setAction] = useState<AuthAction>('read')
  const [trace, setTrace] = useState<AuthTrace | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeNodeId && !nodeId) {
      setNodeId(activeNodeId)
    }
  }, [activeNodeId, nodeId])

  const canRun = Boolean(store?.auth && nodeId)

  const run = async () => {
    if (!store?.auth || !nodeId) {
      return
    }

    setLoading(true)
    setError(null)
    try {
      const nextTrace = await store.auth.explain({ action, nodeId })
      setTrace(nextTrace)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setTrace(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-1 gap-2">
        <label className="text-[10px] text-ink-3">Node ID</label>
        <input
          value={nodeId}
          onChange={(event) => setNodeId(event.target.value)}
          placeholder="node-id"
          className="w-full bg-surface-2 border border-hairline rounded px-2 py-1 text-xs"
        />

        <label className="text-[10px] text-ink-3">Action</label>
        <select
          value={action}
          onChange={(event) => setAction(event.target.value as AuthAction)}
          className="w-full bg-surface-2 border border-hairline rounded px-2 py-1 text-xs"
        >
          {AUTH_ACTIONS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={run}
        disabled={!canRun || loading}
        className="px-2 py-1 text-xs rounded border border-hairline text-ink-1 hover:bg-accent disabled:opacity-50"
      >
        {loading ? 'Checking...' : 'Check Permission'}
      </button>

      {!store?.auth && <div className="text-[10px] text-ink-3">`store.auth` is unavailable.</div>}
      {error && <div className="text-[10px] text-destructive">{error}</div>}

      {trace && <AuthTraceView trace={trace} />}
    </div>
  )
}

function GrantManager() {
  const { store, activeNodeId } = useDevTools()
  const [nodeId, setNodeId] = useState(activeNodeId ?? '')
  const [grants, setGrants] = useState<AuthGrant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [actions, setActions] = useState<AuthAction[]>(['read'])

  useEffect(() => {
    if (activeNodeId && !nodeId) {
      setNodeId(activeNodeId)
    }
  }, [activeNodeId, nodeId])

  const load = async () => {
    if (!store?.auth || !nodeId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await store.auth.listGrants({ nodeId })
      setGrants(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [store, nodeId])

  const toggleAction = (value: AuthAction) => {
    setActions((current) =>
      current.includes(value)
        ? current.filter((candidate) => candidate !== value)
        : [...current, value]
    )
  }

  const createGrant = async () => {
    if (!store?.auth || !nodeId || !to || actions.length === 0) {
      return
    }

    setError(null)
    try {
      await store.auth.grant({ to: to as DID, actions, resource: nodeId } satisfies GrantInput)
      setTo('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const revoke = async (grantId: string) => {
    if (!store?.auth) {
      return
    }
    setError(null)
    try {
      await store.auth.revoke({ grantId })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="p-3 space-y-3 text-xs">
      <div>
        <label className="text-[10px] text-ink-3">Node ID</label>
        <input
          value={nodeId}
          onChange={(event) => setNodeId(event.target.value)}
          placeholder="node-id"
          className="w-full mt-1 bg-surface-2 border border-hairline rounded px-2 py-1"
        />
      </div>

      <div className="bg-surface-2 border border-hairline rounded p-2 space-y-2">
        <div className="text-[10px] text-ink-3">Create Grant</div>
        <input
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="did:key:..."
          className="w-full bg-surface-1 border border-hairline rounded px-2 py-1"
        />
        <div className="flex flex-wrap gap-1">
          {AUTH_ACTIONS.filter((candidate) => candidate !== 'admin').map((candidate) => {
            const selected = actions.includes(candidate)
            return (
              <button
                key={candidate}
                onClick={() => toggleAction(candidate)}
                className={`px-2 py-0.5 rounded border text-[10px] ${
                  selected ? 'border-accent-ink bg-accent text-ink-1' : 'border-hairline text-ink-2'
                }`}
              >
                {candidate}
              </button>
            )
          })}
        </div>
        <button
          onClick={createGrant}
          disabled={!store?.auth || !nodeId || !to || actions.length === 0}
          className="px-2 py-1 rounded border border-hairline text-ink-1 disabled:opacity-50"
        >
          Grant Access
        </button>
      </div>

      {error && <div className="text-[10px] text-destructive">{error}</div>}

      <div className="space-y-1">
        <div className="text-[10px] text-ink-3">Active Grants</div>
        {loading && <div className="text-[10px] text-ink-3">Loading grants...</div>}
        {!loading && grants.length === 0 && (
          <div className="text-[10px] text-ink-3">No grants found for this resource.</div>
        )}
        {grants.map((grant) => (
          <div
            key={grant.id}
            className="bg-surface-2 border border-hairline rounded p-2 flex items-center gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-ink-1 truncate">{grant.grantee}</div>
              <div className="text-[10px] text-ink-3">{grant.actions.join(', ')}</div>
            </div>
            <button
              onClick={() => revoke(grant.id)}
              className="px-2 py-0.5 text-[10px] rounded border border-destructive text-destructive"
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function GrantTimeline() {
  const { store, activeNodeId } = useDevTools()
  const [events, setEvents] = useState<GrantEvent[]>([])

  useEffect(() => {
    const auth = store?.auth
    if (!auth || !activeNodeId) {
      setEvents([])
      return
    }

    let cancelled = false
    const load = async () => {
      const list = await auth.listGrants({ nodeId: activeNodeId, status: 'all' })
      if (cancelled) return
      setEvents(buildGrantTimeline(list))
    }

    void load()
    const unsubscribe = store.subscribe((event) => {
      if (event.node?.schemaId === 'xnet://xnet.fyi/Grant') {
        void load()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [store, activeNodeId])

  return (
    <div className="p-3 space-y-1 text-[10px] font-mono">
      {events.length === 0 && <div className="text-ink-3">No grant timeline events.</div>}
      {events.map((event) => (
        <div key={event.id} className="flex items-center gap-2">
          <span className="text-ink-3 w-20">{formatTimestamp(event.timestamp)}</span>
          <GrantTypeBadge type={event.type} />
          <span className="text-ink-2 truncate">{event.grantee}</span>
          <span className="text-ink-3">{event.actions.join(', ')}</span>
        </div>
      ))}
    </div>
  )
}

function DelegationTreeExplorer() {
  const { store, activeNodeId } = useDevTools()
  const [grants, setGrants] = useState<AuthGrant[]>([])

  useEffect(() => {
    const auth = store?.auth
    if (!auth || !activeNodeId) {
      setGrants([])
      return
    }

    let cancelled = false
    const load = async () => {
      const next = await auth.listGrants({ nodeId: activeNodeId, status: 'all' })
      if (!cancelled) setGrants(next)
    }

    void load()
    const unsubscribe = store.subscribe((event) => {
      if (event.node?.schemaId === 'xnet://xnet.fyi/Grant') {
        void load()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [store, activeNodeId])

  const roots = useMemo(() => buildDelegationRoots(grants), [grants])

  return (
    <div className="p-3 space-y-2 text-[10px]">
      {roots.length === 0 && <div className="text-ink-3">No delegation grants to inspect.</div>}
      {roots.map((root) => (
        <DelegationNode key={root.grant.id} node={root} depth={0} />
      ))}
    </div>
  )
}

function RevocationPropagation() {
  const { store, activeNodeId } = useDevTools()
  const [grants, setGrants] = useState<AuthGrant[]>([])

  useEffect(() => {
    const auth = store?.auth
    if (!auth || !activeNodeId) {
      setGrants([])
      return
    }

    let cancelled = false
    const load = async () => {
      const next = await auth.listGrants({ nodeId: activeNodeId, status: 'all' })
      if (!cancelled) setGrants(next)
    }

    void load()
    const unsubscribe = store.subscribe((event) => {
      if (event.node?.schemaId === 'xnet://xnet.fyi/Grant') {
        void load()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [store, activeNodeId])

  const revoked = grants
    .filter((grant) => grant.revokedAt > 0)
    .sort((left, right) => right.revokedAt - left.revokedAt)

  return (
    <div className="p-3 space-y-2 text-xs">
      {revoked.length === 0 && <div className="text-ink-3 text-[10px]">No recent revocations.</div>}
      {revoked.map((grant) => (
        <div key={grant.id} className="bg-surface-2 border border-hairline rounded p-2">
          <div className="text-ink-1">Grant {grant.id.slice(0, 8)} revoked</div>
          <div className="text-[10px] text-ink-3">Grantee: {grant.grantee}</div>
          <div className="text-[10px] text-ink-3">
            Revoked: {formatTimestamp(grant.revokedAt)} (
            {formatDuration(Date.now() - grant.revokedAt)} ago)
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-2">
            <span className="inline-block w-2 h-2 rounded-full bg-success" />
            <span>Local evaluator cache invalidated</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function GrantTypeBadge({ type }: { type: GrantEventType }) {
  const classes =
    type === 'created'
      ? 'border-border-emphasis text-ink-2'
      : type === 'revoked'
        ? 'border-destructive text-destructive'
        : 'border-warning text-warning'

  return <span className={`px-1 rounded border ${classes}`}>{type}</span>
}

type DelegationTreeNode = {
  grant: AuthGrant
  children: DelegationTreeNode[]
}

function DelegationNode({ node, depth }: { node: DelegationTreeNode; depth: number }) {
  const active = node.grant.revokedAt === 0
  return (
    <div style={{ marginLeft: depth * 12 }} className="space-y-1">
      <div className="flex items-center gap-2">
        <span
          className={`px-1 rounded border text-[10px] ${
            active ? 'border-border-emphasis text-ink-2' : 'border-destructive text-destructive'
          }`}
        >
          {active ? 'active' : 'revoked'}
        </span>
        <span className="text-ink-2 truncate">{node.grant.grantee}</span>
        <span className="text-ink-3">depth: {node.grant.proofDepth}/4</span>
      </div>

      {node.children.map((child) => (
        <DelegationNode key={child.grant.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

function buildGrantTimeline(grants: AuthGrant[]): GrantEvent[] {
  const events: GrantEvent[] = []
  const now = Date.now()

  for (const grant of grants) {
    events.push({
      id: `${grant.id}:created`,
      grantId: grant.id,
      type: 'created',
      resource: grant.resource,
      grantee: grant.grantee,
      actions: grant.actions,
      timestamp: grant.expiresAt > 0 ? Math.min(grant.expiresAt, now) : now
    })

    if (grant.revokedAt > 0) {
      events.push({
        id: `${grant.id}:revoked`,
        grantId: grant.id,
        type: 'revoked',
        resource: grant.resource,
        grantee: grant.grantee,
        actions: grant.actions,
        timestamp: grant.revokedAt
      })
    }

    if (grant.expiresAt > 0 && grant.expiresAt < now) {
      events.push({
        id: `${grant.id}:expired`,
        grantId: grant.id,
        type: 'expired',
        resource: grant.resource,
        grantee: grant.grantee,
        actions: grant.actions,
        timestamp: grant.expiresAt
      })
    }
  }

  return events.sort((left, right) => right.timestamp - left.timestamp)
}

function buildDelegationRoots(grants: AuthGrant[]): DelegationTreeNode[] {
  const byParent = new Map<string, AuthGrant[]>()
  const roots: AuthGrant[] = []

  for (const grant of grants) {
    const parentGrantId = grant.parentGrantId ?? ''
    if (parentGrantId) {
      const existing = byParent.get(parentGrantId) ?? []
      existing.push(grant)
      byParent.set(parentGrantId, existing)
    } else {
      roots.push(grant)
    }
  }

  const build = (grant: AuthGrant): DelegationTreeNode => ({
    grant,
    children: (byParent.get(grant.id) ?? []).map(build)
  })

  return roots.map(build)
}

function formatTimestamp(value: number): string {
  if (!value || Number.isNaN(value)) {
    return '-'
  }

  return new Date(value).toLocaleTimeString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3_600_000)}h`
}
