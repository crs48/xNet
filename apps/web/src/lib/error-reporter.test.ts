import { afterEach, describe, expect, it } from 'vitest'
import { consent } from './consent'
import {
  __resetErrorReporter,
  getDiagnosticsClient,
  initErrorReporter,
  isDiagnosticsConfigured,
  reportError
} from './error-reporter'
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
  it('constructs no ingest client when the build is not the hosted demo', async () => {
    // Neither VITE_XNET_TELEMETRY nor VITE_DIAGNOSTICS_URL is set in tests, so a
    // self-hosted or PR-preview build phones nothing home (exploration 0315).
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
