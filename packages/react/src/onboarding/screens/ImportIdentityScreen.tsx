/**
 * Import identity screen — choose QR scan or recovery phrase.
 */
import { useOnboarding } from '../OnboardingProvider'

export function ImportIdentityScreen(): JSX.Element {
  const { send } = useOnboarding()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <h1 className="text-2xl font-semibold mb-2">Import your identity</h1>

      <p className="text-muted-foreground text-center mb-8 max-w-md">
        Bring your existing xNet identity to this device.
      </p>

      <button
        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors mb-3 w-64"
        onClick={() => send({ type: 'SCAN_QR' })}
      >
        Scan from another device
      </button>

      <button
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        onClick={() => send({ type: 'ENTER_PHRASE' })}
      >
        Enter recovery phrase
      </button>

      <button
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => send({ type: 'BACK_TO_WELCOME' })}
      >
        Back
      </button>
    </div>
  )
}
