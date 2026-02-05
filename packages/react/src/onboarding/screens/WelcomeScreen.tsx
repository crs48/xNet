/**
 * Welcome screen — primary CTA is passkey creation via biometric tap.
 * No skip option. Passkey is required.
 */
import { getPlatformAuthName } from '../helpers'
import { useOnboarding } from '../OnboardingProvider'

export function WelcomeScreen(): JSX.Element {
  const { send } = useOnboarding()

  return (
    <div className="onboarding-screen welcome">
      <h1>Welcome to xNet</h1>
      <p className="subtitle">Your private workspace that syncs everywhere and belongs to you.</p>

      <button className="primary-button" onClick={() => send({ type: 'AUTHENTICATE' })}>
        Use {getPlatformAuthName()} to get started
      </button>

      <button className="text-button" onClick={() => send({ type: 'IMPORT_EXISTING' })}>
        I already have an identity
      </button>
    </div>
  )
}
