/**
 * EscalateReportDialog (exploration 0341 P4) — per-report "Send to xNet" with
 * preview-before-send.
 *
 * Lane-2 semantics, borrowed verbatim from ReportProblemDialog: the operator
 * sees the EXACT JSON the hub forwarder will send (rendered from the same
 * object that is posted, byte-for-byte) and the explicit click is the consent.
 * On success the node is stamped with the vendor's XR-… handle so the console
 * shows what has already been shared.
 */

import type { NodeStore } from '@xnetjs/data'
import { useMemo, useState } from 'react'
import type { IngestRequest } from '../lib/debug-report-drain'
import {
  composeEscalationPayload,
  escalateDebugReport,
  type EscalationPayload
} from '../lib/escalate-report'

export interface EscalateReportDialogProps {
  nodeId: string
  properties: Record<string, unknown>
  store: NodeStore
  request: IngestRequest
  onClose: () => void
  onEscalated?: (shortId: string) => void
}

type Phase = 'preview' | 'sent' | 'error'

export function EscalateReportDialog(props: EscalateReportDialogProps) {
  const [phase, setPhase] = useState<Phase>('preview')
  const [sending, setSending] = useState(false)
  const [shortId, setShortId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const payload: EscalationPayload | null = useMemo(
    () => composeEscalationPayload(props.properties),
    [props.properties]
  )

  const send = async (): Promise<void> => {
    if (!payload) return
    setSending(true)
    try {
      const result = await escalateDebugReport(props.store, props.request, props.nodeId, payload)
      setShortId(result.shortId)
      setPhase('sent')
      props.onEscalated?.(result.shortId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Escalation failed')
      setPhase('error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={props.onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-background p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Send report to xNet"
      >
        <h2 className="text-sm font-semibold">Send report to xNet</h2>

        {phase === 'sent' ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">
              Report sent. Quote this ID if you contact us about it:
            </p>
            <p className="mt-2 font-mono text-base font-semibold">{shortId}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
              >
                Done
              </button>
            </div>
          </div>
        ) : phase === 'error' ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing was recorded as sent. If your hub has diagnostics sharing disabled, this route
              doesn't exist — that's the off switch working.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the exact payload your hub will forward to xNet — nothing else leaves your
              deployment. Your identity is sent only as a salted hash.
            </p>
            <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-accent/20 p-2 text-[11px] leading-snug">
              {payload ? JSON.stringify(payload, null, 2) : 'This report cannot be escalated.'}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !payload}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send to xNet'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
