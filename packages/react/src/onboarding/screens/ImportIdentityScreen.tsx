/**
 * Import identity screen — choose QR scan or recovery phrase.
 */
import { useOnboarding } from '../OnboardingProvider'

export function ImportIdentityScreen(): JSX.Element {
  const { send } = useOnboarding()

  return (
    <div className="onboarding-screen import-identity">
      <h1>Import your identity</h1>

      <p className="subtitle">Bring your existing xNet identity to this device.</p>

      <button className="primary-button" onClick={() => send({ type: 'SCAN_QR' })}>
        Scan from another device
      </button>

      <button className="text-button" onClick={() => send({ type: 'ENTER_PHRASE' })}>
        Enter recovery phrase
      </button>

      <button className="text-button" onClick={() => send({ type: 'BACK_TO_WELCOME' })}>
        Back
      </button>
    </div>
  )
}
