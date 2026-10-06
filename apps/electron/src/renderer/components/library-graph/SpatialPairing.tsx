import { useEffect, useState } from 'react'

export function SpatialPairing({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState('')
  const [pairing, setPairing] = useState<{ url: string; expiresAt: number; count: number } | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void window.xnet
      .spatialStatus()
      .then(setPairing)
      .catch((error: unknown) => setError(String(error)))
  }, [])
  const button =
    'rounded border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50'
  return (
    <div className="relative">
      <button className={button} onClick={() => setOpen(!open)} aria-expanded={open}>
        Spatial viewer
      </button>
      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-96 space-y-3 rounded-lg border border-border bg-background p-5 shadow-xl"
          aria-label="Spatial Library pairing"
        >
          <h3 className="font-medium">Explore on a headset</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pair a read-only viewer with the {ids.length.toLocaleString()} links in this graph view.
            It can read their saved metadata, text and thumbnails for one hour. Private
            conversations and personal notes are excluded.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use the Mac’s address on your private network and an HTTPS certificate already trusted
            by both devices. Next, choose that certificate and its private key on this Mac. No
            public tunnel is opened.
          </p>
          <label className="block text-xs">
            Trusted Mac address
            <input
              className="mt-1 w-full rounded border border-border bg-background p-2"
              placeholder="https://your-mac.local:8443"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              disabled={busy || !!pairing}
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {pairing ? (
            <>
              <p role="status" className="text-xs">
                {pairing.count.toLocaleString()} links · expires{' '}
                {new Date(pairing.expiresAt).toLocaleTimeString()}. The single-use pairing link is
                on your clipboard; open it in the headset browser within five minutes.
              </p>
              <button
                className={button}
                onClick={() =>
                  void window.xnet.spatialCopy().catch((error: unknown) => setError(String(error)))
                }
              >
                Copy pairing link
              </button>
              <button
                className={`${button} ml-2`}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    await window.xnet.spatialStop()
                    setPairing(null)
                  } catch (error) {
                    setError(String(error))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Revoke access
              </button>
            </>
          ) : (
            <button
              className={button}
              disabled={busy || !origin || !ids.length}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  setPairing(await window.xnet.spatialStart({ origin, ids }))
                } catch (error) {
                  setError(error instanceof Error ? error.message : String(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Preparing private snapshot…' : 'Choose certificate & pair'}
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            This is an experiment. Stationary browsing is available first; controller flight depends
            on the headset’s measured input capabilities. Exit the immersive view to search or
            change filters.
          </p>
        </div>
      )}
    </div>
  )
}
