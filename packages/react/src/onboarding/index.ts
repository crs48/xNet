/**
 * @xnet/react/onboarding - Onboarding flow for first-run experience
 */

// State machine
export {
  onboardingReducer,
  createInitialState,
  type OnboardingState,
  type OnboardingEvent,
  type OnboardingMachineContext,
  type OnboardingReducerState
} from './machine'

// Provider & hook
export {
  OnboardingProvider,
  useOnboarding,
  type OnboardingProviderProps,
  type OnboardingContextValue
} from './OnboardingProvider'

// Flow component
export { OnboardingFlow, type OnboardingFlowProps } from './OnboardingFlow'

// Screen components
export { WelcomeScreen } from './screens/WelcomeScreen'
export { AuthenticatingScreen } from './screens/AuthenticatingScreen'
export { AuthErrorScreen } from './screens/AuthErrorScreen'
export { UnsupportedBrowserScreen } from './screens/UnsupportedBrowserScreen'
export { ImportIdentityScreen } from './screens/ImportIdentityScreen'
export { HubConnectScreen } from './screens/HubConnectScreen'
export { ReadyScreen } from './screens/ReadyScreen'
export { SmartWelcome } from './screens/SmartWelcome'
export { SyncProgressOverlay, type SyncProgressOverlayProps } from './screens/SyncProgressOverlay'

// Templates
export { QUICK_START_TEMPLATES, type QuickStartTemplate } from './templates'

// Helpers
export { getPlatformAuthName, truncateDid, copyToClipboard } from './helpers'
