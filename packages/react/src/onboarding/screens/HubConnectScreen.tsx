/**
 * Hub connection screen — shows while connecting to the sync server.
 * Auto-advances to ready once connected (or on failure — hub is optional).
 */
import { useEffect } from 'react'
import { useOnboarding } from '../OnboardingProvider'

export type HubConnectScreenProps = {
  /** Optional: attempt hub connection. If not provided, auto-advances. */
  connectToHub?: () => Promise<void>
}

export function HubConnectScreen({ connectToHub }: HubConnectScreenProps): JSX.Element {
  const { send, context } = useOnboarding()

  useEffect(() => {
    let cancelled = false

    if (connectToHub) {
      connectToHub()
        .then(() => {
          if (!cancelled) send({ type: 'HUB_CONNECTED' })
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            send({
              type: 'HUB_FAILED',
              error: err instanceof Error ? err : new Error(String(err))
            })
          }
        })
    } else {
      // No hub connector provided — skip straight to ready
      send({ type: 'HUB_CONNECTED' })
    }

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <div className="w-12 h-12 mb-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <h1 className="text-2xl font-semibold mb-2">Connecting to sync server</h1>

      <p className="text-muted-foreground mb-4">Setting up secure connection...</p>

      {context.hubUrl && (
        <p className="text-xs text-muted-foreground font-mono">{context.hubUrl}</p>
      )}
    </div>
  )
}
