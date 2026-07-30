/**
 * `/internal/fleet/jobs` — the loudness surface for G2 (exploration 0411).
 *
 * A nightly restore drill that silently stops running is otherwise invisible:
 * it only logs on failure, so "never ran" and "passed" look identical. This
 * route turns absence into an alertable number.
 */

import { MemoryBillingIdentityProvider } from '@xnetjs/cloud/identity'
import { describe, expect, it } from 'vitest'
import { FakeTenantBillingGateway } from '../billing-gateway'
import { buildControlPlane } from '../index'
import { createControlPlaneApp } from '../server'
import { InMemoryDocStore } from '../stores/durable'
import { type JobRecord } from './leased'
import { JobRegistry } from './runner'

const INTERNAL = 'secret123'
const HOUR = 60 * 60_000

function jobsApp(opts: { withJobs?: boolean } = {}) {
  const billing = new MemoryBillingIdentityProvider('https://auth.test/authorize')
  const { controlPlane } = buildControlPlane({ billing })
  const store = new InMemoryDocStore<JobRecord>()
  const now = { t: 100 * HOUR }
  const jobs = new JobRegistry({ store, holder: 'test', nowMs: () => now.t })
  jobs.add({ jobId: 'restore-drill', intervalMs: 24 * HOUR, work: async () => undefined })

  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: new FakeTenantBillingGateway(),
    ...(opts.withJobs === false ? {} : { jobs }),
    internalSecret: INTERNAL,
    sessionSecret: 'sess',
    baseUrl: ''
  })
  return { app, jobs, now }
}

const get = (app: ReturnType<typeof jobsApp>['app']) =>
  app.request('/internal/fleet/jobs', { headers: { 'x-internal-secret': INTERNAL } })

describe('GET /internal/fleet/jobs', () => {
  it('guards behind the internal secret', async () => {
    const { app } = jobsApp()
    expect((await app.request('/internal/fleet/jobs')).status).toBe(403)
  })

  it('503s when job reporting is not configured', async () => {
    // "no jobs registered" and "reporting is off" must not look the same.
    const { app } = jobsApp({ withJobs: false })
    const res = await get(app)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: 'jobs_not_configured' })
  })

  it('reports a never-run job as stale', async () => {
    const { app } = jobsApp()
    const res = await get(app)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      stale: true,
      jobs: [{ jobId: 'restore-drill', lastOutcome: 'never', stalenessMs: null, stale: true }]
    })
  })

  it('goes quiet once the job has run', async () => {
    const { app, jobs } = jobsApp()
    await jobs.tick('restore-drill')
    const body = (await (await get(app)).json()) as { stale: boolean }
    expect(body.stale).toBe(false)
  })

  it('ALERTS when a passing job silently stops running', async () => {
    const { app, jobs, now } = jobsApp()
    await jobs.tick('restore-drill')
    now.t += 49 * HOUR // two missed nights, no failure recorded

    const body = (await (await get(app)).json()) as {
      stale: boolean
      jobs: { lastOutcome: string; stalenessMs: number }[]
    }
    expect(body.stale).toBe(true)
    expect(body.jobs[0]?.lastOutcome).toBe('ok') // the last run PASSED
    expect(body.jobs[0]?.stalenessMs).toBe(49 * HOUR)
  })
})
