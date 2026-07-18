/**
 * @xnetjs/react/onboarding - State machine for the onboarding flow
 *
 * States:
 *   welcome → authenticating → connecting-hub → ready → complete
 *                ↓                                ↑
 *            auth-error ──────── (retry) ────────┘
 *   welcome → unsupported-browser (terminal)
 *   welcome → import-identity → qr-scan/recovery-phrase → connecting-hub
 */
import type { Identity, KeyBundle } from '@xnetjs/identity'

// ─── States ──────────────────────────────────────────────────

export type OnboardingState =
  | 'welcome'
  | 'authenticating'
  | 'auth-error'
  | 'unsupported-browser'
  | 'import-identity'
  | 'qr-scan'
  | 'recovery-phrase'
  | 'guardian-recovery'
  // "Continue with Bluesky (or any PDS)" login door (0322/0338): run the ATProto
  // OAuth ceremony, then the existing passkey-create flow, then write the binding.
  | 'atproto-ceremony'
  // Creating a recoverable identity (exploration 0243): mint → show the phrase to save.
  | 'creating-recoverable'
  | 'show-recovery-phrase'
  | 'connecting-hub'
  | 'ready'
  | 'complete'

// ─── Events ──────────────────────────────────────────────────

export type OnboardingEvent =
  | { type: 'AUTHENTICATE' }
  | { type: 'CREATE_NEW' }
  | { type: 'IMPORT_EXISTING' }
  | { type: 'PASSKEY_SUCCESS'; identity: Identity; keyBundle: KeyBundle }
  | { type: 'PASSKEY_FAILED'; error: Error }
  | { type: 'BROWSER_UNSUPPORTED' }
  | { type: 'RETRY_AUTH' }
  | { type: 'BACK_TO_WELCOME' }
  | { type: 'SCAN_QR' }
  | { type: 'ENTER_PHRASE' }
  | { type: 'IDENTITY_IMPORTED'; identity: Identity; keyBundle: KeyBundle }
  | { type: 'HUB_CONNECTED' }
  | { type: 'HUB_FAILED'; error: Error }
  | { type: 'CREATE_FIRST_PAGE' }
  // Recoverable-identity flow (exploration 0243)
  | { type: 'CREATE_RECOVERABLE' }
  | { type: 'USE_SYNCED_PASSKEY' }
  | { type: 'ENTER_GUARDIAN_SHARES' }
  | { type: 'SUBMIT_GUARDIAN_SHARES'; codes: string[] }
  | { type: 'SUBMIT_PHRASE'; phrase: string }
  | { type: 'IMPORT_FAILED'; error: Error }
  | { type: 'RECOVERABLE_CREATED'; identity: Identity; keyBundle: KeyBundle; phrase: string }
  | { type: 'PHRASE_SAVED' }
  // ATProto login door (0322/0338)
  | { type: 'CONTINUE_WITH_ATPROTO' }
  | { type: 'ATPROTO_LINKED'; atprotoDid: string; atprotoHandle: string; displayName?: string }
  | { type: 'ATPROTO_CEREMONY_FAILED'; error: Error }

// ─── Context ─────────────────────────────────────────────────

export type OnboardingMachineContext = {
  identity: Identity | null
  keyBundle: KeyBundle | null
  hubUrl: string | null
  error: Error | null
  isDemo: boolean
  /** The recovery phrase to show once, after creating a recoverable identity (0243). */
  recoveryPhrase: string | null
  /** Linked ATProto identity from the login-door ceremony (0322/0338), if any. */
  atprotoDid: string | null
  atprotoHandle: string | null
  /** Display name pulled from the ATProto profile, to pre-fill the xNet profile. */
  atprotoDisplayName: string | null
}

// ─── Transition Table ────────────────────────────────────────

/**
 * Transition map: [currentState][eventType] → nextState
 * Missing entries mean the event is ignored in that state.
 */
const TRANSITIONS: Partial<
  Record<OnboardingState, Partial<Record<OnboardingEvent['type'], OnboardingState>>>
> = {
  welcome: {
    AUTHENTICATE: 'authenticating',
    CREATE_NEW: 'authenticating',
    CREATE_RECOVERABLE: 'creating-recoverable',
    CONTINUE_WITH_ATPROTO: 'atproto-ceremony',
    IMPORT_EXISTING: 'import-identity',
    BROWSER_UNSUPPORTED: 'unsupported-browser'
  },
  'atproto-ceremony': {
    // The ceremony handler stores the linked handle (ATPROTO_LINKED, self-loop)
    // then runs the existing passkey-create flow → PASSKEY_SUCCESS.
    ATPROTO_LINKED: 'atproto-ceremony',
    PASSKEY_SUCCESS: 'connecting-hub',
    ATPROTO_CEREMONY_FAILED: 'auth-error',
    BACK_TO_WELCOME: 'welcome'
  },
  'creating-recoverable': {
    RECOVERABLE_CREATED: 'show-recovery-phrase',
    PASSKEY_FAILED: 'auth-error',
    BACK_TO_WELCOME: 'welcome'
  },
  'show-recovery-phrase': {
    PHRASE_SAVED: 'connecting-hub'
  },
  authenticating: {
    PASSKEY_SUCCESS: 'connecting-hub',
    PASSKEY_FAILED: 'auth-error'
  },
  'auth-error': {
    RETRY_AUTH: 'authenticating',
    BACK_TO_WELCOME: 'welcome'
  },
  'import-identity': {
    SCAN_QR: 'qr-scan',
    ENTER_PHRASE: 'recovery-phrase',
    ENTER_GUARDIAN_SHARES: 'guardian-recovery',
    USE_SYNCED_PASSKEY: 'authenticating',
    BACK_TO_WELCOME: 'welcome'
  },
  'guardian-recovery': {
    IDENTITY_IMPORTED: 'connecting-hub',
    IMPORT_FAILED: 'guardian-recovery',
    BACK_TO_WELCOME: 'welcome'
  },
  'qr-scan': {
    IDENTITY_IMPORTED: 'connecting-hub',
    BACK_TO_WELCOME: 'welcome'
  },
  'recovery-phrase': {
    IDENTITY_IMPORTED: 'connecting-hub',
    IMPORT_FAILED: 'recovery-phrase',
    BACK_TO_WELCOME: 'welcome'
  },
  'connecting-hub': {
    HUB_CONNECTED: 'ready',
    HUB_FAILED: 'ready' // Continue anyway — hub is optional
  },
  ready: {
    CREATE_FIRST_PAGE: 'complete'
  }
  // 'unsupported-browser' and 'complete' have no transitions (terminal)
}

// ─── Reducer ─────────────────────────────────────────────────

export type OnboardingReducerState = {
  state: OnboardingState
  context: OnboardingMachineContext
}

export function onboardingReducer(
  current: OnboardingReducerState,
  event: OnboardingEvent
): OnboardingReducerState {
  const transitions = TRANSITIONS[current.state]
  const nextState = transitions?.[event.type]

  // If no valid transition, stay in current state
  if (!nextState) {
    return current
  }

  // Build new context based on event
  const nextContext = { ...current.context }

  switch (event.type) {
    case 'PASSKEY_SUCCESS':
      nextContext.identity = event.identity
      nextContext.keyBundle = event.keyBundle
      nextContext.error = null
      break

    case 'PASSKEY_FAILED':
      nextContext.error = event.error
      break

    case 'IDENTITY_IMPORTED':
      nextContext.identity = event.identity
      nextContext.keyBundle = event.keyBundle
      nextContext.error = null
      break

    case 'RECOVERABLE_CREATED':
      nextContext.identity = event.identity
      nextContext.keyBundle = event.keyBundle
      nextContext.recoveryPhrase = event.phrase
      nextContext.error = null
      break

    case 'IMPORT_FAILED':
      nextContext.error = event.error
      break

    case 'ATPROTO_LINKED':
      nextContext.atprotoDid = event.atprotoDid
      nextContext.atprotoHandle = event.atprotoHandle
      nextContext.atprotoDisplayName = event.displayName ?? null
      nextContext.error = null
      break

    case 'ATPROTO_CEREMONY_FAILED':
      nextContext.error = event.error
      break

    case 'CONTINUE_WITH_ATPROTO':
    case 'CREATE_RECOVERABLE':
      nextContext.error = null
      break

    case 'HUB_FAILED':
      nextContext.error = event.error
      break

    case 'HUB_CONNECTED':
      nextContext.error = null
      break

    case 'RETRY_AUTH':
    case 'AUTHENTICATE':
    case 'CREATE_NEW':
      nextContext.error = null
      break
  }

  return { state: nextState, context: nextContext }
}

// ─── Initial State Factory ───────────────────────────────────

export function createInitialState(hubUrl?: string): OnboardingReducerState {
  return {
    state: 'welcome',
    context: {
      identity: null,
      keyBundle: null,
      hubUrl: hubUrl ?? null,
      error: null,
      isDemo: false,
      recoveryPhrase: null,
      atprotoDid: null,
      atprotoHandle: null,
      atprotoDisplayName: null
    }
  }
}
