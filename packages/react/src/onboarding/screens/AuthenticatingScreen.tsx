/**
 * Authenticating screen — shown while waiting for biometric prompt.
 */
import { getPlatformAuthName } from '../helpers'

export function AuthenticatingScreen(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
      <div className="w-12 h-12 mb-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <h1 className="text-2xl font-semibold mb-2">Waiting for {getPlatformAuthName()}</h1>
      <p className="text-muted-foreground text-center">
        Complete the biometric prompt to continue...
      </p>
    </div>
  )
}
