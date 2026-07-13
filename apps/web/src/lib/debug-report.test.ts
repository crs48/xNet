import { afterEach, describe, expect, it } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import {
  composeDebugReport,
  toSubmitPayload,
  DEFAULT_SECTION_TOGGLES
} from './debug-report'

afterEach(() => {
  __resetBootTimeline()
  delete window.__xnetBootError
})

describe('composeDebugReport', () => {
  it('re-scrubs PII in the description, breadcrumbs, and last-error message', () => {
    window.__xnetBootError = {
      kind: 'render',
      stage: 'store:ready',
      message: 'crashed for chris.smothers@example.com',
      at: 1
    }
    const report = composeDebugReport({
      userDescription:
        'my home is /Users/crs/Code and my id is did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      breadcrumbs: ['error [sync] fetch http://10.0.0.5/api?token=supersecrettokenvalue123456 failed']
    })

    expect(report.userDescription).toContain('/Users/[USER]')
    expect(report.userDescription).toContain('did:method:[REDACTED]')
    expect(report.userDescription).not.toContain('did:key:z6Mk')
    expect(report.breadcrumbs[0]).not.toContain('10.0.0.5')
    expect(report.breadcrumbs[0]).toContain('[IP]')
    expect(report.lastError?.message).toContain('[EMAIL]')
    expect(report.lastError?.message).not.toContain('@example.com')
  })

  it('stamps the furthest boot stage and coarse system info', () => {
    bootMark('init:start')
    bootMark('sqlite:open')
    const report = composeDebugReport({ userDescription: 'stuck' })
    expect(report.bootStage).toBe('sqlite:open')
    expect(report.surface).toBe('web')
    // jsdom's UA reduces to a coarse family — never the raw string.
    expect(report.uaFamily).toMatch(/\//)
    expect(report.uaFamily).not.toContain('Mozilla/5.0')
  })

  it('omits lastError when nothing was captured', () => {
    const report = composeDebugReport({ userDescription: 'just checking' })
    expect(report.lastError).toBeUndefined()
  })
})

describe('toSubmitPayload', () => {
  const composed = {
    userDescription: 'blank editor',
    release: '1.42.317',
    surface: 'web' as const,
    bootStage: 'store:ready',
    uaFamily: 'Chrome 137 / macOS',
    breadcrumbs: ['info [general] ok'],
    lastError: { kind: 'render', message: 'boom', stage: 'store:ready' }
  }

  it('includes every section by default and always carries the description + lane fields', () => {
    const payload = toSubmitPayload(composed, DEFAULT_SECTION_TOGGLES)
    expect(payload.userDescription).toBe('blank editor')
    expect(payload.breadcrumbs).toEqual(['info [general] ok'])
    expect(payload.release).toBe('1.42.317')
    expect(payload.uaFamily).toBe('Chrome 137 / macOS')
    expect(payload.errorName).toBe('render')
  })

  it('drops the sections the user unticked — the preview equals the payload', () => {
    const payload = toSubmitPayload(composed, {
      breadcrumbs: false,
      systemInfo: false,
      lastError: false
    })
    expect(payload.breadcrumbs).toBeUndefined()
    expect(payload.release).toBeUndefined()
    expect(payload.uaFamily).toBeUndefined()
    expect(payload.bootStage).toBeUndefined()
    // With lastError excluded, the message falls back to the user's words.
    expect(payload.message).toBe('blank editor')
    expect(payload.userDescription).toBe('blank editor')
  })
})
