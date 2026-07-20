import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHub, type HubInstance } from '../src'

describe('Health metadata', () => {
  let hub: HubInstance
  const PORT = 14451

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: false,
      storage: 'memory',
      runtime: {
        platform: 'fly',
        region: 'ams',
        machineId: 'fly-test'
      }
    })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  it('includes platform metadata in /health', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`)
    const body = (await res.json()) as { platform: string; region?: string; machineId?: string }
    expect(body.platform).toBe('fly')
    expect(body.region).toBe('ams')
    expect(body.machineId).toBe('fly-test')
  })

  it('returns shields.io badge format at /health/badge', async () => {
    const res = await fetch(`http://localhost:${PORT}/health/badge`)
    expect(res.ok).toBe(true)
    const body = (await res.json()) as {
      schemaVersion: number
      label: string
      message: string
      color: string
    }
    expect(body.schemaVersion).toBe(1)
    // The badge label is role-aware (0383 W1). This hub boots with no role, so
    // it reports the default; the live demo hub (--role demo) still reads
    // "demo hub", byte-identical to the pre-role hardcoded label.
    expect(body.label).toBe('personal hub')
    expect(body.message).toMatch(/^online · \d+m$|^online · \d+h \d+m$/)
    expect(body.color).toBe('brightgreen')
  })
})
