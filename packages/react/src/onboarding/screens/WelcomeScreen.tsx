/**
 * Welcome screen — primary CTA is passkey creation via biometric tap.
 * No skip option. Passkey is required.
 */
import { getPlatformAuthName } from '../helpers'
import { useOnboarding } from '../OnboardingProvider'

export function WelcomeScreen(): JSX.Element {
  const { send } = useOnboarding()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <h1 className="text-3xl font-bold mb-3">Welcome to xNet</h1>
      <p className="text-muted-foreground text-center mb-8 max-w-md">
        Your private workspace that syncs everywhere and belongs to you.
      </p>

      <button
        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors mb-4"
        onClick={() => send({ type: 'AUTHENTICATE' })}
      >
        Use {getPlatformAuthName()} to get started
      </button>

      <button
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => send({ type: 'IMPORT_EXISTING' })}
      >
        I already have an identity
      </button>
    </div>
  )
}
