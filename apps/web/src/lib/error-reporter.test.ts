import { afterEach, describe, expect, it } from 'vitest'
import { consent } from './consent'
import {
  __resetErrorReporter,
  getDiagnosticsClient,
  initErrorReporter,
  isDiagnosticsConfigured,
  isDiagnosticsLocalFirst,
  reportError,
  toCrashPing
} from './error-reporter'
import { diagnosticsIngestBase, HUB_URL_STORAGE_KEY } from './hub-url'
import { __resetSentry, captureToSentry, isSentryConfigured, publicKeyFromDsn } from './sentry'

afterEach(async () => {
  await consent.reset()
  __resetErrorReporter()
  __resetSentry()
})

describe('reportError', () => {
  it('captures a crash without throwing once consent allows sharing', async () => {
    await consent.setTier('crashes')
    expect(() =>
      reportError({ kind: 'init', stage: 'sqlite:open', message: 'OPFS denied', at: 1 })
    ).not.toThrow()
  })

  it('is a silent no-op below the crashes tier', () => {
    // tier is 'off' (reset in afterEach) — collector drops it, Sentry gate fails.
    expect(() =>
      reportError({ kind: 'timeout', stage: 'pre-react', message: 'stuck', at: 1 })
    ).not.toThrow()
  })
})

describe('initErrorReporter', () => {
  it('no-ops when telemetry is not enabled for the build', () => {
    // VITE_XNET_TELEMETRY is unset in tests → registers no sink.
    expect(() => initErrorReporter()).not.toThrow()
  })
})

describe('diagnostics transport gating (self-host / preview invariant)', () => {
  it('constructs no ingest client when hubless and not the hosted demo', async () => {
    // Neither VITE_XNET_TELEMETRY nor VITE_DIAGNOSTICS_URL is set in tests and
    // no hub is configured, so a self-hosted or PR-preview build phones
    // nothing home — not even to a hub, because there isn't one (0315/0341).
    expect(isDiagnosticsConfigured()).toBe(false)
    expect(getDiagnosticsClient()).toBeNull()
    // Even at the crashes tier, reporting stays a no-op with no transport.
    await consent.setTier('crashes')
    expect(() =>
      reportError({ kind: 'init', stage: 'sqlite:open', message: 'boom', at: 1 })
    ).not.toThrow()
    expect(getDiagnosticsClient()).toBeNull()
  })
})

describe('toCrashPing — TaggedError routing (0303/0341)', () => {
  const failure = { kind: 'init', stage: 'sqlite:open', message: 'boom', at: 1 } as const

  it('prefers _tag (and code) over the raw error name', () => {
    const tagged = Object.assign(new Error('relay fell over'), {
      _tag: 'NodeRelayError',
      code: 'RELAY_TIMEOUT'
    })
    expect(toCrashPing(failure, tagged).errorName).toBe('NodeRelayError.RELAY_TIMEOUT')

    const tagOnly = Object.assign(new Error('denied'), { _tag: 'PermissionError' })
    expect(toCrashPing(failure, tagOnly).errorName).toBe('PermissionError')
  })

  it('falls back to the error name for untagged errors', () => {
    expect(toCrashPing(failure, new TypeError('x')).errorName).toBe('TypeError')
  })
})

describe('deployment-local resolution (0341)', () => {
  afterEach(() => {
    localStorage.removeItem(HUB_URL_STORAGE_KEY)
    __resetErrorReporter()
  })

  it('targets the connected hub without any telemetry env vars', () => {
    localStorage.setItem(HUB_URL_STORAGE_KEY, 'wss://hub.my-deployment.example')
    // The user's own hub is not "telemetry": the client is constructed even on
    // builds where the vendor lanes are off, and it points at the hub origin.
    expect(isDiagnosticsLocalFirst()).toBe(true)
    expect(isDiagnosticsConfigured()).toBe(true)
    expect(getDiagnosticsClient()).not.toBeNull()
  })

  it('maps the hub ws(s) URL to its http(s) diagnostics origin', () => {
    localStorage.setItem(HUB_URL_STORAGE_KEY, 'wss://hub.my-deployment.example')
    expect(diagnosticsIngestBase()).toBe('https://hub.my-deployment.example')
    localStorage.setItem(HUB_URL_STORAGE_KEY, 'ws://localhost:8787')
    expect(diagnosticsIngestBase()).toBe('http://localhost:8787')
  })
})

describe('sentry adapter', () => {
  it('extracts the public key from a DSN', () => {
    expect(publicKeyFromDsn('https://abc123@o0.ingest.sentry.io/42')).toBe('abc123')
  })

  it('returns null for a malformed DSN', () => {
    expect(publicKeyFromDsn('not a dsn')).toBeNull()
  })

  it('reports unconfigured + no-ops without a DSN', () => {
    expect(isSentryConfigured()).toBe(false)
    expect(() => captureToSentry(new Error('x'))).not.toThrow()
  })
})
