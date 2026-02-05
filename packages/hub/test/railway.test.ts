import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHub, type HubInstance } from '../src'
import { resolveConfig } from '../src/config'

describe('Railway deployment', () => {
  let hub: HubInstance
  const PORT = 14462
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'xnet-railway-'))
    process.env.PORT = String(PORT)
    process.env.RAILWAY_VOLUME_MOUNT_PATH = tmpDir

    const config = resolveConfig({ auth: false, storage: 'memory' })
    hub = await createHub(config)
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
    delete process.env.PORT
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('serves health check on Railway port', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`)
    expect(res.status).toBe(200)
  })
})
