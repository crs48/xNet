/**
 * ReportProblemDialog (exploration 0315 P2) — user-triggered debug report with
 * preview-before-send.
 *
 * The user writes what went wrong; the dialog composes a scrubbed report from
 * local diagnostics (boot stage, coarse system info, recent console lines, the
 * last captured error) and shows the EXACT JSON payload with a checkbox per
 * section. What they see is byte-for-byte what is sent. On send it returns a
 * short handle ("XR-7F3A2B") they can quote in a GitHub issue (Signal's flow).
 *
 * Consent-tier-independent by design: an explicit, previewed send is itself the
 * consent for this payload, so it works even at tier `off`.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  collectElectronCrashBreadcrumbs,
  composeDebugReport,
  toSubmitPayload,
  DEFAULT_SECTION_TOGGLES,
  type ReportSectionToggles
} from '../lib/debug-report'
import { getDiagnosticsClient } from '../lib/error-reporter'

export interface ReportProblemDialogProps {
  onClose: () => void
  /** Recent scrubbed console lines (devtools ring); omitted outside the app. */
  breadcrumbs?: string[]
}

type Phase = 'compose' | 'preview' | 'sent' | 'unavailable'

export function ReportProblemDialog({ onClose, breadcrumbs }: ReportProblemDialogProps) {
  const [description, setDescription] = useState('')
  const [toggles, setToggles] = useState<ReportSectionToggles>(DEFAULT_SECTION_TOGGLES)
  const [phase, setPhase] = useState<Phase>('compose')
  const [sending, setSending] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [electronCrumbs, setElectronCrumbs] = useState<string[]>([])

  // Pull main-process crash lines from the Electron bridge, if present.
  useEffect(() => {
    void collectElectronCrashBreadcrumbs().then(setElectronCrumbs)
  }, [])

  const composed = useMemo(
    () =>
      composeDebugReport({
        userDescription: description,
        breadcrumbs: [...(breadcrumbs ?? []), ...electronCrumbs]
      }),
    [description, breadcrumbs, electronCrumbs]
  )

  const payload = useMemo(() => toSubmitPayload(composed, toggles), [composed, toggles])

  const toggle = (key: keyof ReportSectionToggles) => (): void =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }))

  const send = async (): Promise<void> => {
    const client = getDiagnosticsClient()
    if (!client) {
      setPhase('unavailable')
      return
    }
    setSending(true)
    const result = await client.submit(payload)
    setSending(false)
    if (result) {
      setReportId(result.shortId)
      setPhase('sent')
    } else {
      setPhase('unavailable')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-background p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report a problem"
      >
        <h2 className="text-sm font-semibold">Report a problem</h2>

        {phase === 'sent' ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">
              Thanks — your report was sent. Quote this ID in a GitHub issue if you'd like us to
              follow up:
            </p>
            <p className="mt-2 font-mono text-base font-semibold">{reportId}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
              >
                Done
              </button>
            </div>
          </div>
        ) : phase === 'unavailable' ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">
              This build can't send reports (diagnostics aren't configured, or the network is
              unavailable). Nothing left your device.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
              >
                Close
              </button>
            </div>
          </div>
        ) : phase === 'compose' ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Tell us what happened. You'll see exactly what gets sent before anything leaves your
              device.
            </p>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">What went wrong?</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                autoFocus
                placeholder="e.g. the editor went blank after I pasted an image"
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPhase('preview')}
                disabled={description.trim().length === 0}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50 disabled:opacity-60"
              >
                Preview
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the complete report. Untick any section you'd rather not include.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={toggles.systemInfo} onChange={toggle('systemInfo')} />
                System info
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={toggles.breadcrumbs}
                  onChange={toggle('breadcrumbs')}
                />
                Recent logs ({composed.breadcrumbs.length})
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={toggles.lastError}
                  disabled={!composed.lastError}
                  onChange={toggle('lastError')}
                />
                Last error
              </label>
            </div>
            <pre className="mt-3 flex-1 overflow-auto rounded-md bg-secondary p-3 text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(payload, null, 2)}
            </pre>
            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setPhase('compose')}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50 disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
