/**
 * @xnet/react/onboarding - Main onboarding flow component
 *
 * Routes to the correct screen based on the current onboarding state.
 * Must be rendered inside an <OnboardingProvider>.
 */
import { useOnboarding } from './OnboardingProvider'
import { WelcomeScreen } from './screens/WelcomeScreen'
import { AuthenticatingScreen } from './screens/AuthenticatingScreen'
import { AuthErrorScreen } from './screens/AuthErrorScreen'
import { UnsupportedBrowserScreen } from './screens/UnsupportedBrowserScreen'
import { ImportIdentityScreen } from './screens/ImportIdentityScreen'
import { HubConnectScreen, type HubConnectScreenProps } from './screens/HubConnectScreen'
import { ReadyScreen } from './screens/ReadyScreen'

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
        <div className="onboarding-screen">
          <h1>QR Scan</h1>
          <p>Coming soon — scan a QR code from another device.</p>
        </div>
      )
    case 'recovery-phrase':
      // Placeholder — Phase 3 will implement recovery phrase entry
      return (
        <div className="onboarding-screen">
          <h1>Recovery Phrase</h1>
          <p>Coming soon — enter your recovery phrase.</p>
        </div>
      )
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
