/**
 * ReportDialog (exploration 0176) — categorized abuse report.
 *
 * Writes an AbuseReport node (via useSafetyActions). Categories are drawn from
 * the moderation label vocabulary so reports and labels share one taxonomy.
 */
import { useState } from 'react'

export const REPORT_CATEGORIES: { id: string; name: string }[] = [
  { id: 'harassment', name: 'Harassment or bullying' },
  { id: 'spam', name: 'Spam' },
  { id: 'scam', name: 'Scam or fraud' },
  { id: 'impersonation', name: 'Impersonation' },
  { id: 'sexual', name: 'Unwanted sexual content' },
  { id: 'porn', name: 'Explicit content' },
  { id: 'graphic-media', name: 'Graphic or violent media' },
  { id: 'malware', name: 'Malware or harmful link' }
]

export interface ReportDialogProps {
  subjectLabel: string
  onSubmit: (input: { category: string; reason: string }) => Promise<void>
  onClose: () => void
}

export function ReportDialog({ subjectLabel, onSubmit, onClose }: ReportDialogProps) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0].id)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    await onSubmit({ category, reason: reason.trim() })
    setSubmitting(false)
    setDone(true)
    setTimeout(onClose, 900)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-background p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">Report {subjectLabel}</h2>
        {done ? (
          <p className="mt-3 text-sm text-muted-foreground">Thanks — your report was submitted.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Reports are sent to moderation. The reported person is not notified.
            </p>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                {REPORT_CATEGORIES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Details (optional)</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
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
                onClick={() => void submit()}
                disabled={submitting}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50 disabled:opacity-60"
              >
                Submit report
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
