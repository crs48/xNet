/**
 * @xnetjs/react/onboarding - Main onboarding flow component
 *
 * Routes to the correct screen based on the current onboarding state.
 * Must be rendered inside an <OnboardingProvider>.
 */
import { useOnboarding } from './OnboardingProvider'
import { AtprotoCeremonyScreen } from './screens/AtprotoCeremonyScreen'
import { AuthenticatingScreen } from './screens/AuthenticatingScreen'
import { AuthErrorScreen } from './screens/AuthErrorScreen'
import { GuardianRecoveryScreen } from './screens/GuardianRecoveryScreen'
import { HubConnectScreen, type HubConnectScreenProps } from './screens/HubConnectScreen'
import { ImportIdentityScreen } from './screens/ImportIdentityScreen'
import { ReadyScreen } from './screens/ReadyScreen'
import { RecoveryPhraseScreen } from './screens/RecoveryPhraseScreen'
import { ShowRecoveryPhraseScreen } from './screens/ShowRecoveryPhraseScreen'
import { UnsupportedBrowserScreen } from './screens/UnsupportedBrowserScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'

export interface OnboardingFlowProps {
  /** Optional hub connection function */
  connectToHub?: HubConnectScreenProps['connectToHub']
  /** Render prop for the completed state (app content) */
  children?: React.ReactNode
}

/**
 * Renders the correct onboarding screen based on state machine state.
 *
 * @example
 * <OnboardingProvider onComplete={handleComplete}>
 *   <OnboardingFlow>
 *     <App />
 *   </OnboardingFlow>
 * </OnboardingProvider>
 */
export function OnboardingFlow({ connectToHub, children }: OnboardingFlowProps): JSX.Element {
  const { state } = useOnboarding()

  switch (state) {
    case 'welcome':
      return <WelcomeScreen />
    case 'authenticating':
      return <AuthenticatingScreen />
    case 'auth-error':
      return <AuthErrorScreen />
    case 'unsupported-browser':
      return <UnsupportedBrowserScreen />
    case 'import-identity':
      return <ImportIdentityScreen />
    case 'qr-scan':
      // Placeholder — Phase 3 (Cross-Device Sync) will implement QR scanning
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
          <h1 className="text-2xl font-semibold mb-2">QR Scan</h1>
          <p className="text-muted-foreground">Coming soon — scan a QR code from another device.</p>
        </div>
      )
    case 'recovery-phrase':
      return <RecoveryPhraseScreen />
    case 'guardian-recovery':
      return <GuardianRecoveryScreen />
    case 'atproto-ceremony':
      return <AtprotoCeremonyScreen />
    case 'creating-recoverable':
      return <AuthenticatingScreen />
    case 'show-recovery-phrase':
      return <ShowRecoveryPhraseScreen />
    case 'connecting-hub':
      return <HubConnectScreen connectToHub={connectToHub} />
    case 'ready':
      return <ReadyScreen />
    case 'complete':
      return <>{children}</>
    default:
      return <WelcomeScreen />
  }
}
