import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'

const resetEnv = () => {
  delete process.env.PORT
  delete process.env.HUB_PORT
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH
  delete process.env.HUB_DATA_DIR
  delete process.env.RAILWAY_GRACE_MS
  delete process.env.FLY_REGION
  delete process.env.FLY_MACHINE_ID
}

describe('resolveConfig', () => {
  afterEach(() => {
    resetEnv()
  })

  it('prefers Railway env vars over CLI options', () => {
    process.env.PORT = '5555'
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/railway/data'
    process.env.RAILWAY_GRACE_MS = '9000'

    const config = resolveConfig({ port: 4444, dataDir: '/tmp/data' })
    expect(config.port).toBe(5555)
    expect(config.dataDir).toBe('/railway/data')
    expect(config.shutdownGraceMs).toBe(9000)
    expect(config.runtime?.platform).toBe('railway')
  })

  it('detects Fly.io runtime metadata', () => {
    process.env.FLY_REGION = 'ams'
    process.env.FLY_MACHINE_ID = 'fly-123'

    const config = resolveConfig({})
    expect(config.runtime?.platform).toBe('fly')
    expect(config.runtime?.region).toBe('ams')
    expect(config.runtime?.machineId).toBe('fly-123')
    expect(config.shutdownGraceMs).toBe(4000)
  })
})
