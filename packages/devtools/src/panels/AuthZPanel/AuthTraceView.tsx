/**
 * Shared rendering for an authorization decision/trace — an ALLOWED/DENIED
 * badge plus the derivation (roles, grants, deny reasons, evaluation steps).
 *
 * Extracted from the AuthZ Playground so both that panel and the Data panel's
 * per-cell permission popover render decisions identically. Presentational —
 * the caller fetches the trace via `store.auth.explain(...)`.
 */

export type AuthTraceStep = {
  phase: string
  output: Record<string, unknown>
}

export type AuthTrace = {
  allowed: boolean
  roles: string[]
  grants: string[]
  reasons: string[]
  duration: number
  steps: AuthTraceStep[]
}

export function StatusBadge({ allowed }: { allowed: boolean }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] border ${
        allowed
          ? 'border-success bg-success-muted text-success'
          : 'border-destructive bg-destructive-muted text-destructive'
      }`}
    >
      {allowed ? 'ALLOWED' : 'DENIED'}
    </span>
  )
}

export function AuthTraceView({ trace }: { trace: AuthTrace }) {
  return (
    <div className="space-y-2 text-[10px] bg-surface-2 border border-hairline rounded p-2">
      <div className="flex items-center gap-2">
        <StatusBadge allowed={trace.allowed} />
        <span className="text-ink-2">Duration: {trace.duration.toFixed(2)}ms</span>
      </div>
      <div className="text-ink-2">Roles: {trace.roles.join(', ') || 'none'}</div>
      <div className="text-ink-2">Grants: {trace.grants.join(', ') || 'none'}</div>
      {trace.reasons.length > 0 && (
        <div className="text-destructive">Reasons: {trace.reasons.join(', ')}</div>
      )}
      <div className="border-t border-hairline pt-2">
        <div className="text-ink-3 mb-1">Evaluation Steps</div>
        {trace.steps.length === 0 && <div className="text-ink-3">No steps reported.</div>}
        {trace.steps.map((step, index) => (
          <div
            key={`${step.phase}-${index}`}
            className="py-1 border-b border-hairline last:border-none"
          >
            <div className="text-ink-1">{step.phase}</div>
            <div className="text-ink-3 break-all">{JSON.stringify(step.output)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
