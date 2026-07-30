/**
 * @xnetjs/react/onboarding - React context provider for the onboarding flow
 */
import type { Identity, KeyBundle } from '@xnetjs/identity'
import {
  detectPasskeySupport,
  createIdentityManager,
  isTestBypassEnabled,
  parseShare
} from '@xnetjs/identity'
import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode
} from 'react'
import {
  onboardingReducer,
  createInitialState,
  type OnboardingState,
  type OnboardingEvent,
  type OnboardingMachineContext
} from './machine'
import type { RunAtprotoCeremony } from './atproto-ceremony'

// ─── Context ─────────────────────────────────────────────────

export type OnboardingContextValue = {
  state: OnboardingState
  context: OnboardingMachineContext
  send: (event: OnboardingEvent) => void
  /** Whether the ATProto login door is available (host supplied a ceremony). */
  atprotoEnabled: boolean
  /**
   * Run the ATProto login door for a typed handle/PDS (0322/0338): OAuth
   * ceremony → existing passkey-create → write the binding record. No-op when
   * the ceremony was not provided.
   */
  startAtprotoCeremony: (handleOrPds: string) => void
}

const OnboardingCtx = createContext<OnboardingContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────

export type OnboardingProviderProps = {
  children: ReactNode
  /** Default hub URL for new users */
  defaultHubUrl?: string
  /** Called when onboarding completes */
  onComplete?: (identity: Identity, keyBundle: KeyBundle) => void
  /**
   * ATProto login-door ceremony (0322/0338). When provided, the "Continue with
   * Bluesky (or any PDS)" door is offered; the host app supplies the OAuth
   * implementation. When omitted, the door is hidden.
   */
  runAtprotoCeremony?: RunAtprotoCeremony
}

export function OnboardingProvider({
  children,
  defaultHubUrl = 'wss://hub.xnet.fyi',
  onComplete,
  runAtprotoCeremony
}: OnboardingProviderProps): JSX.Element {
  const [{ state, context }, dispatch] = useReducer(
    onboardingReducer,
    createInitialState(defaultHubUrl)
  )

  // Create identity manager once and keep it stable
  // This is important so preflight() caches PRF support for create()
  const manager = useMemo(() => createIdentityManager(), [])

  // Check browser support AND preflight PRF detection on mount
  // This must happen BEFORE user clicks, so Safari/WebKit doesn't
  // invalidate the user gesture when we call WebAuthn
  useEffect(() => {
    let cancelled = false

    // Preflight the manager to detect PRF support
    manager.preflight().catch(() => {
      // Ignore preflight errors - we'll handle them at create time
    })

    // Also check basic browser support
    detectPasskeySupport()
      .then((support) => {
        if (isTestBypassEnabled()) {
          return
        }

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
  }, [manager])

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

        // Use the preflighted manager (has cached PRF support info)
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

      // Create a recoverable identity (exploration 0243): mint, enroll a gating
      // passkey, and surface the phrase so the user can save it.
      if (event.type === 'CREATE_RECOVERABLE' && state === 'welcome') {
        if (authInFlight.current) return
        authInFlight.current = true
        manager
          .createRecoverable()
          .then(({ keyBundle, phrase }) => {
            dispatch({
              type: 'RECOVERABLE_CREATED',
              identity: keyBundle.identity,
              keyBundle,
              phrase
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

      // Recover via a passkey synced from another device (iCloud / Google).
      if (event.type === 'USE_SYNCED_PASSKEY' && state === 'import-identity') {
        if (authInFlight.current) return
        authInFlight.current = true
        manager
          .recoverViaSyncedPasskey()
          .then((keyBundle) => {
            if (keyBundle) {
              dispatch({ type: 'PASSKEY_SUCCESS', identity: keyBundle.identity, keyBundle })
            } else {
              dispatch({
                type: 'PASSKEY_FAILED',
                error: new Error('No synced passkey found on this device')
              })
            }
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

      // Recover from guardian shares (social recovery): reconstruct the phrase from
      // k-of-n shares, reproduce the same identity, and enroll a local passkey.
      if (event.type === 'SUBMIT_GUARDIAN_SHARES' && state === 'guardian-recovery') {
        if (authInFlight.current) return
        authInFlight.current = true
        Promise.resolve()
          .then(() => {
            const shares = event.codes.map((code) => parseShare(code))
            return manager.recoverFromGuardianShares(shares)
          })
          .then(({ keyBundle }) => {
            dispatch({ type: 'IDENTITY_IMPORTED', identity: keyBundle.identity, keyBundle })
          })
          .catch((err: unknown) => {
            dispatch({
              type: 'IMPORT_FAILED',
              error: err instanceof Error ? err : new Error(String(err))
            })
          })
          .finally(() => {
            authInFlight.current = false
          })
      }

      // Recover from a typed phrase: enroll a local passkey and adopt the identity.
      if (event.type === 'SUBMIT_PHRASE' && state === 'recovery-phrase') {
        if (authInFlight.current) return
        authInFlight.current = true
        manager
          .importRecoveryPhrase(event.phrase)
          .then(({ keyBundle }) => {
            dispatch({
              type: 'IDENTITY_IMPORTED',
              identity: keyBundle.identity,
              keyBundle
            })
          })
          .catch((err: unknown) => {
            dispatch({
              type: 'IMPORT_FAILED',
              error: err instanceof Error ? err : new Error(String(err))
            })
          })
          .finally(() => {
            authInFlight.current = false
          })
      }

      dispatch(event)
    },
    [state, manager]
  )

  // ATProto login door (0322/0338): OAuth ceremony → the *existing* passkey
  // create flow (unchanged) → write the signed binding record. The Bluesky
  // account never holds or recovers xNet keys unless the user later enrolls
  // the Phase-2 recovery anchor.
  const startAtprotoCeremony = useCallback(
    (handleOrPds: string) => {
      if (!runAtprotoCeremony || authInFlight.current) return
      authInFlight.current = true
      runAtprotoCeremony({ handleOrPds })
        .then(async (result) => {
          dispatch({
            type: 'ATPROTO_LINKED',
            atprotoDid: result.atprotoDid,
            atprotoHandle: result.atprotoHandle,
            displayName: result.displayName
          })
          const keyBundle = await manager.create()
          if (result.writeBinding) {
            await result.writeBinding(keyBundle.identity.did, keyBundle.signingKey)
          }
          dispatch({ type: 'PASSKEY_SUCCESS', identity: keyBundle.identity, keyBundle })
        })
        .catch((err: unknown) => {
          dispatch({
            type: 'ATPROTO_CEREMONY_FAILED',
            error: err instanceof Error ? err : new Error(String(err))
          })
        })
        .finally(() => {
          authInFlight.current = false
        })
    },
    [runAtprotoCeremony, manager]
  )

  const value = useMemo(
    () => ({
      state,
      context,
      send,
      atprotoEnabled: Boolean(runAtprotoCeremony),
      startAtprotoCeremony
    }),
    [state, context, send, runAtprotoCeremony, startAtprotoCeremony]
  )

  return <OnboardingCtx.Provider value={value}>{children}</OnboardingCtx.Provider>
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
