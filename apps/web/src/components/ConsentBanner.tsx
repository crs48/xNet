/**
 * First-run diagnostics consent prompt (exploration 0210).
 *
 * A small, non-modal corner card — NOT a blocking cookie wall. Analytics is
 * cookieless and needs no consent, so this asks only about the one thing that
 * benefits from an explicit choice: sharing scrubbed crash reports. It appears
 * once, only in the official hosted demo (`VITE_XNET_TELEMETRY`), and only until
 * the user makes a choice. Either button records that choice (via the consent
 * spine's `grantedAt`), so it never nags twice. Full controls live in
 * Settings → Privacy & Diagnostics.
 */
import { ShieldCheck, X } from 'lucide-react'
import { useConsent } from '../lib/use-consent'

const TELEMETRY_ENABLED = import.meta.env.VITE_XNET_TELEMETRY === 'on'

export function ConsentBanner(): JSX.Element | null {
  const { chosen, setTier, reset } = useConsent()

  // Only the hosted demo asks, only before a choice has been made.
  if (!TELEMETRY_ENABLED || chosen) return null

  return (
    <div
      role="dialog"
      aria-label="Diagnostics consent"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-hairline bg-surface-0 p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-2" />
        <div className="flex-1">
          <p className="text-sm font-medium text-ink-1">Help us fix what breaks?</p>
          <p className="mt-1 text-xs text-ink-2">
            Share scrubbed crash reports — no documents, no personal data. You can change this
            anytime in Settings → Privacy &amp; Diagnostics.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setTier('crashes')}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent/90"
            >
              Share crash reports
            </button>
            <button
              onClick={() => reset()}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2"
            >
              No thanks
            </button>
          </div>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => reset()}
          className="shrink-0 text-ink-3 transition-colors hover:text-ink-1"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
