import { afterEach, describe, expect, it } from 'vitest'
import { consent } from './consent'
import { __resetErrorReporter, initErrorReporter, reportError } from './error-reporter'
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
