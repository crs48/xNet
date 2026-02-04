/**
 * Authenticating screen — shown while waiting for biometric prompt.
 */
import { getPlatformAuthName } from '../helpers'

export function AuthenticatingScreen(): JSX.Element {
  return (
    <div className="onboarding-screen authenticating">
      <h1>Waiting for {getPlatformAuthName()}</h1>
      <p className="spinner-text">Complete the biometric prompt to continue...</p>
    </div>
  )
}
