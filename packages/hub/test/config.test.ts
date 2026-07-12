import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config'

const resetEnv = () => {
  delete process.env.PORT
  delete process.env.HUB_PORT
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH
  delete process.env.HUB_DATA_DIR
  delete process.env.RAILWAY_GRACE_MS
  delete process.env.HUB_AWARENESS_MAX_UPDATE_SIZE
  delete process.env.FLY_REGION
  delete process.env.FLY_MACHINE_ID
  delete process.env.HUB_AUTH
  delete process.env.HUB_ALLOW_UNSIGNED_REPLICATION
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

  it('resolves awareness max update size from env', () => {
    process.env.HUB_AWARENESS_MAX_UPDATE_SIZE = '2048'

    const config = resolveConfig({ awarenessMaxUpdateSize: 1024 })
    expect(config.awarenessMaxUpdateSize).toBe(2048)
  })

  it('does not warn for the safe defaults', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolveConfig({})
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('loudly warns when auth is disabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.HUB_AUTH = 'false'
    resolveConfig({})
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/SECURITY.*auth is DISABLED/))
    warn.mockRestore()
  })

  it('loudly warns when unsigned replication is enabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.HUB_ALLOW_UNSIGNED_REPLICATION = 'true'
    resolveConfig({})
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/SECURITY.*HUB_ALLOW_UNSIGNED_REPLICATION/)
    )
    warn.mockRestore()
  })
})
