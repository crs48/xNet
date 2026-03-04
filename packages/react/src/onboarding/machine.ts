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

// ─── Context ─────────────────────────────────────────────────

export type OnboardingMachineContext = {
  identity: Identity | null
  keyBundle: KeyBundle | null
  hubUrl: string | null
  error: Error | null
  isDemo: boolean
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
    IMPORT_EXISTING: 'import-identity',
    BROWSER_UNSUPPORTED: 'unsupported-browser'
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
    BACK_TO_WELCOME: 'welcome'
  },
  'qr-scan': {
    IDENTITY_IMPORTED: 'connecting-hub',
    BACK_TO_WELCOME: 'welcome'
  },
  'recovery-phrase': {
    IDENTITY_IMPORTED: 'connecting-hub',
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
      isDemo: false
    }
  }
}
