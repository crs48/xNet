/**
 * Authentication error screen — retry only, no skip.
 */
import { getPlatformAuthName } from '../helpers'
import { useOnboarding } from '../OnboardingProvider'

export function AuthErrorScreen(): JSX.Element {
  const { send, context } = useOnboarding()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <div className="text-5xl mb-4">!</div>
      <h1 className="text-2xl font-semibold mb-2">Authentication failed</h1>

      <p className="text-muted-foreground mb-2">Could not set up {getPlatformAuthName()}.</p>

      {context.error && (
        <p className="text-destructive text-sm mb-4 max-w-md text-center">
          {context.error.message}
        </p>
      )}

      <button
        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors mb-3"
        onClick={() => send({ type: 'RETRY_AUTH' })}
      >
        Try again
      </button>

      <button
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        onClick={() => send({ type: 'BACK_TO_WELCOME' })}
      >
        Back to welcome
      </button>

      <p className="text-xs text-muted-foreground max-w-sm text-center">
        Make sure your browser supports passkeys (Chrome 116+, Safari 18+, Edge 116+).
      </p>
    </div>
  )
}
