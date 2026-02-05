/**
 * Authentication error screen — retry only, no skip.
 */
import { useOnboarding } from '../OnboardingProvider'
import { getPlatformAuthName } from '../helpers'

export function AuthErrorScreen(): JSX.Element {
  const { send, context } = useOnboarding()

  return (
    <div className="onboarding-screen auth-error">
      <h1>Authentication failed</h1>

      <p>Could not set up {getPlatformAuthName()}.</p>

      {context.error && <p className="error-detail">{context.error.message}</p>}

      <button className="primary-button" onClick={() => send({ type: 'RETRY_AUTH' })}>
        Try again
      </button>

      <button className="text-button" onClick={() => send({ type: 'BACK_TO_WELCOME' })}>
        Back to welcome
      </button>

      <p className="help-text">
        Make sure your browser supports passkeys (Chrome 116+, Safari 18+, Edge 116+).
      </p>
    </div>
  )
}
