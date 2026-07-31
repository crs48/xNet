/**
 * The approval card — one rendering of a parked agent action (0394 Phase 2,
 * extended by 0414).
 *
 * Shared deliberately. An action parked by the in-panel assistant and one
 * parked by a bridged coding agent are the same decision for the operator, and
 * they should not look like two different features: same risk tone, same
 * review-before-approve gate, same words. The only thing that varies is who
 * hands the decision back — the panel's ceremony, or the desktop's IPC bridge.
 *
 * Medium risk shows the approval code (replying `APPROVE <code>` and pressing
 * the button ride the same nonce machinery). High risk refuses the chat path
 * entirely: approval is the deliberate in-app kind, stamped with the operator's
 * DID, and the button stays disabled until the change has been reviewed —
 * seeing what you release is the point, not a speed bump.
 */

import type { ParkedApproval } from '@xnetjs/plugins'
import { useState, type JSX } from 'react'

/** Plain-language names for the tools an operator may be asked to approve. */
export const TOOL_LABELS: Record<string, string> = {
  xnet_search: 'Searching your workspace',
  xnet_graph_expand: 'Following links between your notes',
  xnet_read_page_markdown: 'Reading a page',
  xnet_database_describe: 'Looking at a database',
  xnet_database_query: 'Querying a database',
  xnet_database_sample: 'Sampling a database',
  xnet_canvas_list: 'Listing your canvases',
  xnet_canvas_read_viewport: 'Reading a canvas',
  xnet_canvas_search: 'Searching a canvas',
  xnet_get_audit_log: 'Checking the audit log',
  xnet_validate_page_markdown: 'Checking a page edit',
  xnet_plan_page_patch: 'Planning a page edit',
  xnet_apply_page_markdown: 'Editing a page',
  xnet_apply_database_mutation: 'Changing a database',
  xnet_apply_frame_placement: 'Placing a frame on a page',
  xnet_compose_page: 'Creating a page',
  xnet_create_page: 'Creating a page',
  xnet_create_task: 'Creating a task',
  xnet_update: 'Updating an item',
  xnet_delete: 'Deleting an item'
}

export function ApprovalCard({
  pending,
  operatorDID,
  origin,
  onApprove,
  onDeny
}: {
  pending: ParkedApproval
  operatorDID: string | null
  /** Named on the card when the action came from somewhere other than this panel. */
  origin?: string
  onApprove: () => void
  onDeny: () => void
}): JSX.Element {
  const [reviewed, setReviewed] = useState(false)
  const needsReview = pending.surface === 'app'
  const canApprove = !needsReview || reviewed
  const riskTone =
    pending.surface === 'app'
      ? 'border-rose-400/60 bg-rose-500/5'
      : 'border-amber-400/60 bg-amber-500/5'
  return (
    <div
      className={`rounded-lg border p-2.5 text-[12px] ${riskTone}`}
      data-approval-card={pending.surface}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">
          {pending.risk} risk
        </span>
        <span className="font-medium text-ink-1">{TOOL_LABELS[pending.tool] ?? pending.tool}</span>
        {origin ? <span className="text-[10px] text-ink-3">via {origin}</span> : null}
      </div>
      <p className="mt-1 text-ink-2">
        {pending.surface === 'chat' && pending.code ? (
          <>
            Reply <code className="rounded bg-surface-2 px-1">APPROVE {pending.code}</code> to run
            this, or use the buttons.
          </>
        ) : (
          <>
            This is a {pending.risk}-risk change and needs your explicit in-app approval
            {operatorDID ? ` as ${operatorDID.slice(0, 24)}…` : ''}.
          </>
        )}
      </p>
      {needsReview ? (
        <details
          className="mt-1.5"
          onToggle={(event) => {
            if ((event.target as HTMLDetailsElement).open) setReviewed(true)
          }}
        >
          <summary className="cursor-pointer text-[11px] text-ink-3">
            Review the change before approving
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-2 p-2 text-[10px] leading-relaxed text-ink-2">
            {JSON.stringify(pending.args, null, 2)}
          </pre>
        </details>
      ) : (
        <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-surface-2 p-2 text-[10px] leading-relaxed text-ink-3">
          {JSON.stringify(pending.args, null, 2)}
        </pre>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!canApprove}
          onClick={onApprove}
          title={canApprove ? undefined : 'Open the review above first'}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            canApprove
              ? 'cursor-pointer border-hairline bg-surface-0 text-ink-1 hover:bg-surface-2'
              : 'cursor-not-allowed border-hairline bg-surface-2 text-ink-3'
          }`}
        >
          {pending.surface === 'app' ? 'Approve in app' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={onDeny}
          className="cursor-pointer rounded-md border border-hairline bg-surface-0 px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-2"
        >
          Deny
        </button>
        <span className="ml-auto text-[10px] text-ink-3">
          expires {new Date(pending.expiresAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}
