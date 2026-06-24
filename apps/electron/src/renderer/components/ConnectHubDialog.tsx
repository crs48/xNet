/**
 * ConnectHubDialog — confirms an xNet Cloud "Open in desktop app" deep link
 * (`xnet://connect?hub=…`) before pointing the app at a managed hub.
 *
 * Security: the deep link is an open redirect into the native app. The main
 * process already hard-validates the hub (wss + host allowlist), but we never
 * auto-connect — the user must explicitly confirm here, seeing exactly which hub
 * they're about to sync through. Cancel leaves the current hub untouched.
 */

import { Cloud, X } from 'lucide-react'
import React, { useEffect, useState } from 'react'

export interface ConnectHubRequest {
  hub: string
  code?: string
}

interface ConnectHubDialogProps {
  /** The pending connect request, or null when the dialog is closed. */
  request: ConnectHubRequest | null
  onCancel: () => void
  /** Persist + apply the hub. Resolves once the app is pointed at it. */
  onConfirm: (request: ConnectHubRequest) => Promise<void> | void
}

type Status = 'idle' | 'connecting' | 'done' | 'error'

function hubHost(hub: string): string {
  try {
    return new URL(hub).host
  } catch {
    return hub
  }
}

export function ConnectHubDialog({ request, onCancel, onConfirm }: ConnectHubDialogProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  // Reset transient state whenever a new request opens the dialog.
  useEffect(() => {
    if (request) {
      setStatus('idle')
      setError(null)
    }
  }, [request])

  if (!request) return null

  const handleConfirm = async () => {
    setStatus('connecting')
    setError(null)
    try {
      await onConfirm(request)
      setStatus('done')
      // Brief success beat, then close.
      window.setTimeout(() => onCancel(), 900)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const busy = status === 'connecting' || status === 'done'

  return (
    <>
      {/* Backdrop — clicking it cancels (only while not mid-connect). */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={busy ? undefined : onCancel} />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect to xNet Cloud"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] bg-background border border-border rounded-lg shadow-xl z-50"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Cloud size={16} className="text-primary" />
            <h2 className="text-sm font-medium">Connect to xNet Cloud?</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-muted-foreground mb-3">
            A link from your xNet Cloud dashboard wants to connect this app to the hub below. Your
            data will sync through it.
          </p>

          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1">Hub</div>
            <code className="block w-full px-3 py-2 text-sm font-mono bg-secondary border border-border rounded-md text-foreground break-all">
              {request.hub}
            </code>
          </div>

          <p className="text-xs text-amber-500 mb-4">
            Only continue if you just started this from <strong>{hubHost(request.hub)}</strong>. If
            you didn&apos;t, choose Cancel — your current hub stays unchanged.
          </p>

          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-hover transition-colors disabled:opacity-70"
            >
              {status === 'connecting'
                ? 'Connecting…'
                : status === 'done'
                  ? 'Connected ✓'
                  : 'Connect'}
            </button>
          </div>
        </div>

        <div className="px-4 py-3 bg-secondary/50 border-t border-border rounded-b-lg">
          <p className="text-xs text-muted-foreground">
            After connecting, create your passkey when prompted and approve the device code in your
            dashboard to finish linking your data identity.
          </p>
        </div>
      </div>
    </>
  )
}
