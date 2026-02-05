/**
 * @xnet/react/onboarding - React context provider for the onboarding flow
 */
import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode
} from 'react'
import type { Identity, KeyBundle } from '@xnet/identity'
import { detectPasskeySupport, createIdentityManager } from '@xnet/identity'
import {
  onboardingReducer,
  createInitialState,
  type OnboardingState,
  type OnboardingEvent,
  type OnboardingMachineContext
} from './machine'

// ─── Context ─────────────────────────────────────────────────

export type OnboardingContextValue = {
  state: OnboardingState
  context: OnboardingMachineContext
  send: (event: OnboardingEvent) => void
}

const OnboardingCtx = createContext<OnboardingContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────

export type OnboardingProviderProps = {
  children: ReactNode
  /** Default hub URL for new users */
  defaultHubUrl?: string
  /** Called when onboarding completes */
  onComplete?: (identity: Identity, keyBundle: KeyBundle) => void
}

export function OnboardingProvider({
  children,
  defaultHubUrl = 'wss://hub.xnet.fyi',
  onComplete
}: OnboardingProviderProps): JSX.Element {
  const [{ state, context }, dispatch] = useReducer(
    onboardingReducer,
    createInitialState(defaultHubUrl)
  )

  // Check browser support on mount
  useEffect(() => {
    let cancelled = false
    detectPasskeySupport()
      .then((support) => {
        if (!cancelled && (!support.webauthn || !support.platform)) {
          dispatch({ type: 'BROWSER_UNSUPPORTED' })
        }
      })
      .catch(() => {
        // If detection fails, don't block — let user try
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Notify completion
  useEffect(() => {
    if (state === 'complete' && context.identity && context.keyBundle && onComplete) {
      onComplete(context.identity, context.keyBundle)
    }
  }, [state, context.identity, context.keyBundle, onComplete])

  // Guard against concurrent passkey creation (e.g. double-click)
  const authInFlight = useRef(false)

  const send = useCallback(
    (event: OnboardingEvent) => {
      // Side effects: trigger passkey creation/unlock
      if (
        ((event.type === 'AUTHENTICATE' || event.type === 'CREATE_NEW') && state === 'welcome') ||
        (event.type === 'RETRY_AUTH' && state === 'auth-error')
      ) {
        if (authInFlight.current) return // Prevent duplicate calls
        authInFlight.current = true

        const manager = createIdentityManager()
        manager
          .create()
          .then((keyBundle) => {
            dispatch({
              type: 'PASSKEY_SUCCESS',
              identity: keyBundle.identity,
              keyBundle
            })
          })
          .catch((err: unknown) => {
            dispatch({
              type: 'PASSKEY_FAILED',
              error: err instanceof Error ? err : new Error(String(err))
            })
          })
          .finally(() => {
            authInFlight.current = false
          })
      }

      dispatch(event)
    },
    [state]
  )

  return (
    <OnboardingCtx.Provider value={{ state, context, send }}>{children}</OnboardingCtx.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Access the onboarding state machine from within an OnboardingProvider.
 */
export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingCtx)
  if (!ctx) {
    throw new Error('useOnboarding must be used within <OnboardingProvider>')
  }
  return ctx
}
