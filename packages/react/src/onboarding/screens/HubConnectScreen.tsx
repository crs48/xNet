/**
 * Hub connection screen — shows while connecting to the sync server.
 * Auto-advances to ready once connected (or on failure — hub is optional).
 */
import { useEffect } from 'react'
import { useOnboarding } from '../OnboardingProvider'

export interface HubConnectScreenProps {
  /** Optional: attempt hub connection. If not provided, auto-advances. */
  connectToHub?: () => Promise<void>
}

export function HubConnectScreen({ connectToHub }: HubConnectScreenProps): JSX.Element {
  const { send, context } = useOnboarding()

  useEffect(() => {
    if (connectToHub) {
      connectToHub()
        .then(() => send({ type: 'HUB_CONNECTED' }))
        .catch((err: unknown) =>
          send({
            type: 'HUB_FAILED',
            error: err instanceof Error ? err : new Error(String(err))
          })
        )
    } else {
      // No hub connector provided — skip straight to ready
      send({ type: 'HUB_CONNECTED' })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="onboarding-screen hub-connect">
      <h1>Connecting to sync server</h1>

      <p className="spinner-text">Setting up secure connection...</p>

      {context.hubUrl && <p className="hub-url">{context.hubUrl}</p>}
    </div>
  )
}
