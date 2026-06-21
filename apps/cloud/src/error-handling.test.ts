import type { ControlPlane } from './control-plane'
import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { afterEach, describe, expect, it } from 'vitest'
import { createLogger, type LogLevel } from './logger'
import { __resetSentry, reportToSentry } from './sentry'
import { createControlPlaneApp } from './server'
import { buildControlPlane } from './index'

function recordingLogger() {
  const lines: { level: LogLevel; obj: Record<string, unknown> }[] = []
  const logger = createLogger({
    level: 'debug',
    sink: (level, line) => lines.push({ level, obj: JSON.parse(line) })
  })
  return { logger, lines }
}

describe('request logging middleware', () => {
  it('logs one structured request line with method/path/status/ms', async () => {
    const { logger, lines } = recordingLogger()
    const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
    const { controlPlane } = buildControlPlane({ billing })
    const app = createControlPlaneApp({ controlPlane, billing, logger })

    const res = await app.request('/health')
    expect(res.status).toBe(200)

    const request = lines.find((l) => l.obj.msg === 'request')
    expect(request?.obj).toMatchObject({ method: 'GET', path: '/health', status: 200 })
    expect(typeof request?.obj.ms).toBe('number')
  })
})

describe('global onError handler', () => {
  it('converts an uncaught throw into a logged 500 instead of leaking a stack', async () => {
    const { logger, lines } = recordingLogger()
    // A control plane whose listTenants() throws — /status.json has no try/catch
    // around it, so the throw reaches the global onError safety net.
    const throwing = {
      listTenants: async () => {
        throw new Error('kaboom')
      }
    } as unknown as ControlPlane
    const app = createControlPlaneApp({
      controlPlane: throwing,
      billing: new MemoryBillingIdentityProvider(),
      logger
    })

    const res = await app.request('/status.json')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })

    const unhandled = lines.find((l) => l.obj.msg === 'unhandled')
    expect(unhandled?.level).toBe('error')
    expect(unhandled?.obj).toMatchObject({ path: '/status.json', error: 'kaboom' })
    // The request line still fires (logged in a finally), now with status 500.
    expect(lines.find((l) => l.obj.msg === 'request')?.obj.status).toBe(500)
  })
})

describe('reportToSentry', () => {
  afterEach(() => __resetSentry())

  it('no-ops without a DSN', () => {
    expect(() => reportToSentry('', new Error('x'))).not.toThrow()
  })

  it('no-ops safely when the SDK is not installed', () => {
    // With no @sentry/node dependency the dynamic import rejects and is swallowed.
    expect(() =>
      reportToSentry('https://examplePublicKey@o0.ingest.sentry.io/0', new Error('y'))
    ).not.toThrow()
  })
})
