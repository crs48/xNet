import { resolveEntitlements, signEntitlements, withStorage } from '@xnetjs/entitlements'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from './config'
import { DEFAULT_CONFIG } from './types'

const SECRET = 'hub-plan-secret'
const ENV_KEYS = ['HUB_PLAN', 'XNET_PLAN_SECRET', 'K_SERVICE', 'K_REVISION', 'GOOGLE_CLOUD_REGION']

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

describe('resolveConfig — plan-aware quotas', () => {
  it('keeps DEFAULT_CONFIG limits when HUB_PLAN is absent (self-host)', () => {
    const config = resolveConfig({})
    expect(config.defaultQuota).toBe(DEFAULT_CONFIG.defaultQuota)
    expect(config.maxBlobSize).toBe(DEFAULT_CONFIG.maxBlobSize)
    expect(config.maxConnections).toBe(DEFAULT_CONFIG.maxConnections)
  })

  it('applies plan-driven quotas from a signed HUB_PLAN token (managed)', () => {
    const entitlements = withStorage(resolveEntitlements('personal'), 50 * 1024 * 1024 * 1024)
    process.env.HUB_PLAN = signEntitlements(entitlements, SECRET)
    process.env.XNET_PLAN_SECRET = SECRET

    const config = resolveConfig({})
    expect(config.defaultQuota).toBe(50 * 1024 * 1024 * 1024)
    expect(config.maxBlobSize).toBe(entitlements.maxBlobBytes)
    expect(config.maxConnections).toBe(entitlements.maxConnections)
  })

  it('throws on a HUB_PLAN with a missing secret', () => {
    process.env.HUB_PLAN = signEntitlements(resolveEntitlements('team'), SECRET)
    expect(() => resolveConfig({})).toThrow(/XNET_PLAN_SECRET is missing/)
  })
})

describe('resolveConfig — managed platform detection', () => {
  it('detects Cloud Run from K_SERVICE', () => {
    process.env.K_SERVICE = 'xnet-hub-alice'
    process.env.K_REVISION = 'xnet-hub-alice-00001'
    process.env.GOOGLE_CLOUD_REGION = 'us-central1'
    const config = resolveConfig({})
    expect(config.runtime?.platform).toBe('cloud-run')
    expect(config.runtime?.region).toBe('us-central1')
    expect(config.runtime?.machineId).toBe('xnet-hub-alice-00001')
  })
})
