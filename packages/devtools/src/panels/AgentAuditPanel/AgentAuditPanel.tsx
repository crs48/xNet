/**
 * Agent audit console (exploration 0337) — the table view over `AgentAction`
 * nodes, filterable by agent DID, with the approval decision and produced
 * change ids per action. The DebugReport treatment (0315) applied to agents:
 * the workbench IS the audit console.
 */

import { useAgentAudit, type AgentActionRow } from './useAgentAudit'

const RISK_COLORS: Record<string, string> = {
  low: 'text-green-600',
  medium: 'text-yellow-600',
  high: 'text-orange-600',
  critical: 'text-red-600'
}

const STATUS_COLORS: Record<string, string> = {
  proposed: 'text-ink-3',
  'pending-approval': 'text-yellow-600',
  approved: 'text-blue-600',
  denied: 'text-red-600',
  applied: 'text-green-600',
  'rolled-back': 'text-purple-600',
  failed: 'text-red-600'
}

export function AgentAuditPanel() {
  const state = useAgentAudit()

  if (!state.loading && state.rows.length === 0 && state.agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <div className="text-sm font-medium">No agent activity yet</div>
          <div className="mt-1 text-xs text-ink-3">
            Enroll an agent (<code>xnet agent enroll &lt;name&gt; --space &lt;id&gt;</code>) and
            serve it with <code>xnet mcp serve --agent &lt;name&gt;</code>. Every guarded tool call
            lands here as an AgentAction node.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-3">Agent</span>
        <select
          className="rounded border border-hairline bg-transparent px-1.5 py-0.5 text-xs"
          value={state.agentFilter ?? ''}
          onChange={(e) => state.setAgentFilter(e.target.value || null)}
        >
          <option value="">All ({state.agents.length})</option>
          {state.agents.map((did) => (
            <option key={did} value={did}>
              {labelForAgent(did, state.passports)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-ink-3">{state.rows.length} actions</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-hairline text-[10px] uppercase tracking-wide text-ink-3">
                <th className="px-3 py-1.5 font-medium">Time</th>
                <th className="px-2 py-1.5 font-medium">Tool</th>
                <th className="px-2 py-1.5 font-medium">Risk</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Approval</th>
                <th className="px-2 py-1.5 font-medium">Changes</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => state.setSelectedId(row.id === state.selected?.id ? null : row.id)}
                  className={`cursor-pointer border-b border-hairline/50 hover:bg-surface-2 ${
                    state.selected?.id === row.id ? 'bg-surface-2' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-1 text-ink-3">
                    {row.createdAt ? new Date(row.createdAt).toLocaleTimeString() : '—'}
                  </td>
                  <td className="px-2 py-1 font-mono">{row.tool}</td>
                  <td className={`px-2 py-1 ${RISK_COLORS[row.risk] ?? ''}`}>{row.risk}</td>
                  <td className={`px-2 py-1 ${STATUS_COLORS[row.status] ?? ''}`}>{row.status}</td>
                  <td className="px-2 py-1 text-ink-3">
                    {row.approval ? `${row.approval.decision} (${row.approval.surface})` : '—'}
                  </td>
                  <td className="px-2 py-1 text-ink-3">{row.changeIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {state.selected && <DetailPane row={state.selected} />}
      </div>
    </div>
  )
}

function labelForAgent(
  did: string,
  passports: Array<{ agentDID: string; displayName: string; runtime: string }>
): string {
  const passport = passports.find((p) => p.agentDID === did)
  if (!passport) return shortDid(did)
  return `${passport.displayName || shortDid(did)} (${passport.runtime})`
}

const shortDid = (did: string): string => (did.length > 24 ? `${did.slice(0, 24)}…` : did)

function DetailPane({ row }: { row: AgentActionRow }) {
  return (
    <div className="w-72 shrink-0 overflow-auto border-l border-hairline p-3 text-xs">
      <div className="font-mono text-[10px] text-ink-3">{row.id}</div>
      <Field label="Agent" value={row.agentDID} mono />
      <Field label="Session" value={row.session} mono />
      <Field label="Channel" value={row.channel} />
      <Field label="Reversibility" value={row.reversibility} />
      {row.instruction && <Field label="Instruction" value={row.instruction} />}
      {row.error && <Field label="Error" value={row.error} />}
      {row.approval && (
        <>
          <Field label="Approval" value={`${row.approval.decision} via ${row.approval.surface}`} />
          {row.approval.approverDID && (
            <Field label="Approver" value={row.approval.approverDID} mono />
          )}
          {row.approval.peer && <Field label="Peer" value={row.approval.peer} mono />}
        </>
      )}
      {row.changeIds.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-ink-3">Change ids</div>
          {row.changeIds.map((id) => (
            <div key={id} className="truncate font-mono text-[10px]">
              {id}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`break-words ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</div>
    </div>
  )
}
