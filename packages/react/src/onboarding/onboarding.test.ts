import { generateKeyBundle } from '@xnet/identity'
import { describe, it, expect } from 'vitest'
import { getPlatformAuthName, truncateDid } from './helpers'
import {
  onboardingReducer,
  createInitialState,
  type OnboardingReducerState,
  type OnboardingEvent
} from './machine'
import { QUICK_START_TEMPLATES } from './templates'

// ─── Helper ──────────────────────────────────────────────────

function send(state: OnboardingReducerState, event: OnboardingEvent): OnboardingReducerState {
  return onboardingReducer(state, event)
}

function makeIdentityEvent(): OnboardingEvent & { type: 'PASSKEY_SUCCESS' } {
  const kb = generateKeyBundle()
  return { type: 'PASSKEY_SUCCESS', identity: kb.identity, keyBundle: kb }
}

function makeImportEvent(): OnboardingEvent & { type: 'IDENTITY_IMPORTED' } {
  const kb = generateKeyBundle()
  return { type: 'IDENTITY_IMPORTED', identity: kb.identity, keyBundle: kb }
}

// ─── State Machine Tests ─────────────────────────────────────

describe('Onboarding State Machine', () => {
  describe('initial state', () => {
    it('starts at welcome', () => {
      const s = createInitialState()
      expect(s.state).toBe('welcome')
      expect(s.context.identity).toBeNull()
      expect(s.context.keyBundle).toBeNull()
    })

    it('accepts a hub URL', () => {
      const s = createInitialState('wss://hub.example.com')
      expect(s.context.hubUrl).toBe('wss://hub.example.com')
    })
  })

  describe('happy path: welcome → authenticate → hub → ready → complete', () => {
    it('transitions through the full flow', () => {
      let s = createInitialState('wss://hub.xnet.fyi')

      // welcome → authenticating
      s = send(s, { type: 'AUTHENTICATE' })
      expect(s.state).toBe('authenticating')

      // authenticating → connecting-hub
      const successEvent = makeIdentityEvent()
      s = send(s, successEvent)
      expect(s.state).toBe('connecting-hub')
      expect(s.context.identity).toBe(successEvent.identity)
      expect(s.context.keyBundle).toBe(successEvent.keyBundle)

      // connecting-hub → ready
      s = send(s, { type: 'HUB_CONNECTED' })
      expect(s.state).toBe('ready')
      expect(s.context.error).toBeNull()

      // ready → complete
      s = send(s, { type: 'CREATE_FIRST_PAGE' })
      expect(s.state).toBe('complete')
    })
  })

  describe('auth error path', () => {
    it('transitions to auth-error on failure', () => {
      let s = createInitialState()
      s = send(s, { type: 'AUTHENTICATE' })
      expect(s.state).toBe('authenticating')

      const error = new Error('User cancelled')
      s = send(s, { type: 'PASSKEY_FAILED', error })
      expect(s.state).toBe('auth-error')
      expect(s.context.error).toBe(error)
    })

    it('can retry from auth-error', () => {
      let s = createInitialState()
      s = send(s, { type: 'AUTHENTICATE' })
      s = send(s, { type: 'PASSKEY_FAILED', error: new Error('fail') })
      expect(s.state).toBe('auth-error')

      s = send(s, { type: 'RETRY_AUTH' })
      expect(s.state).toBe('authenticating')
      expect(s.context.error).toBeNull()
    })

    it('can go back to welcome from auth-error', () => {
      let s = createInitialState()
      s = send(s, { type: 'AUTHENTICATE' })
      s = send(s, { type: 'PASSKEY_FAILED', error: new Error('fail') })

      s = send(s, { type: 'BACK_TO_WELCOME' })
      expect(s.state).toBe('welcome')
    })
  })

  describe('unsupported browser', () => {
    it('transitions to unsupported-browser (terminal)', () => {
      let s = createInitialState()
      s = send(s, { type: 'BROWSER_UNSUPPORTED' })
      expect(s.state).toBe('unsupported-browser')

      // No transitions out of unsupported-browser
      s = send(s, { type: 'AUTHENTICATE' })
      expect(s.state).toBe('unsupported-browser')
    })
  })

  describe('import identity path', () => {
    it('supports QR scan import', () => {
      let s = createInitialState()
      s = send(s, { type: 'IMPORT_EXISTING' })
      expect(s.state).toBe('import-identity')

      s = send(s, { type: 'SCAN_QR' })
      expect(s.state).toBe('qr-scan')

      const importEvent = makeImportEvent()
      s = send(s, importEvent)
      expect(s.state).toBe('connecting-hub')
      expect(s.context.identity).toBe(importEvent.identity)
    })

    it('supports recovery phrase import', () => {
      let s = createInitialState()
      s = send(s, { type: 'IMPORT_EXISTING' })
      s = send(s, { type: 'ENTER_PHRASE' })
      expect(s.state).toBe('recovery-phrase')

      const importEvent = makeImportEvent()
      s = send(s, importEvent)
      expect(s.state).toBe('connecting-hub')
    })

    it('can go back from import-identity', () => {
      let s = createInitialState()
      s = send(s, { type: 'IMPORT_EXISTING' })
      s = send(s, { type: 'BACK_TO_WELCOME' })
      expect(s.state).toBe('welcome')
    })
  })

  describe('hub connection', () => {
    it('hub failure still advances to ready (hub is optional)', () => {
      let s = createInitialState()
      s = send(s, { type: 'AUTHENTICATE' })
      s = send(s, makeIdentityEvent())
      expect(s.state).toBe('connecting-hub')

      const error = new Error('Connection refused')
      s = send(s, { type: 'HUB_FAILED', error })
      expect(s.state).toBe('ready')
      expect(s.context.error).toBe(error)
    })
  })

  describe('no skip option', () => {
    it('welcome has no SKIP event', () => {
      let s = createInitialState()
      // Try sending a random event — should stay in welcome
      s = send(s, { type: 'CREATE_FIRST_PAGE' })
      expect(s.state).toBe('welcome')

      s = send(s, { type: 'HUB_CONNECTED' })
      expect(s.state).toBe('welcome')
    })

    it('auth-error has no SKIP event', () => {
      let s = createInitialState()
      s = send(s, { type: 'AUTHENTICATE' })
      s = send(s, { type: 'PASSKEY_FAILED', error: new Error('fail') })

      // Only RETRY_AUTH and BACK_TO_WELCOME work
      s = send(s, { type: 'CREATE_FIRST_PAGE' })
      expect(s.state).toBe('auth-error')
    })
  })

  describe('invalid transitions are ignored', () => {
    it('ignores events that have no transition in current state', () => {
      let s = createInitialState()

      // PASSKEY_SUCCESS in welcome state → ignored
      s = send(s, makeIdentityEvent())
      expect(s.state).toBe('welcome')

      // HUB_CONNECTED in welcome → ignored
      s = send(s, { type: 'HUB_CONNECTED' })
      expect(s.state).toBe('welcome')
    })

    it('complete is terminal', () => {
      let s = createInitialState()
      s = send(s, { type: 'AUTHENTICATE' })
      s = send(s, makeIdentityEvent())
      s = send(s, { type: 'HUB_CONNECTED' })
      s = send(s, { type: 'CREATE_FIRST_PAGE' })
      expect(s.state).toBe('complete')

      // Nothing transitions out of complete
      s = send(s, { type: 'AUTHENTICATE' })
      expect(s.state).toBe('complete')
    })
  })
})

// ─── Helper Tests ────────────────────────────────────────────

describe('helpers', () => {
  describe('getPlatformAuthName', () => {
    it('returns a non-empty string', () => {
      const name = getPlatformAuthName()
      expect(name.length).toBeGreaterThan(0)
    })
  })

  describe('truncateDid', () => {
    it('truncates long DIDs', () => {
      const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
      const truncated = truncateDid(did)
      expect(truncated).toContain('...')
      expect(truncated.length).toBeLessThan(did.length)
    })

    it('does not truncate short strings', () => {
      const short = 'did:key:z6Mk'
      expect(truncateDid(short)).toBe(short)
    })
  })
})

// ─── Templates Tests ─────────────────────────────────────────

describe('QUICK_START_TEMPLATES', () => {
  it('has at least one template', () => {
    expect(QUICK_START_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('each template has required fields', () => {
    for (const tmpl of QUICK_START_TEMPLATES) {
      expect(tmpl.id).toBeTruthy()
      expect(tmpl.name).toBeTruthy()
      expect(tmpl.description).toBeTruthy()
      expect(tmpl.icon).toBeTruthy()
    }
  })

  it('template IDs are unique', () => {
    const ids = QUICK_START_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
