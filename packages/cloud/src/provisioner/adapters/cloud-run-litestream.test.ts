import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import { UnknownTenantError, type ProvisionSpec } from '../types'
import {
  CloudRunLitestreamProvisioner,
  FakeCloudRunClient,
  serviceIdForTenant,
  type CloudRunLitestreamConfig
} from './cloud-run-litestream'

const config: CloudRunLitestreamConfig = {
  projectPrefix: 'xnet-cloud',
  region: 'us-central1',
  imageRepository: 'us-docker.pkg.dev/xnet-cloud-0/hub',
  r2Bucket: 'xnet-hub-data',
  r2Endpoint: 'https://acct.r2.cloudflarestorage.com',
  r2AccessKeyId: 'AKID',
  r2SecretAccessKey: 'SECRET'
}

const spec = (over: Partial<ProvisionSpec> = {}): ProvisionSpec => ({
  tenantId: 't_user_a',
  entitlements: resolveEntitlements('personal'),
  targetVersion: '1.0.0',
  env: { HUB_PLAN: 'signed-token' },
  ...over
})

const REF = { project: 'xnet-cloud-0', region: 'us-central1', service: 't-user-a' }

function setup(cfg: CloudRunLitestreamConfig = config) {
  const client = new FakeCloudRunClient()
  const provisioner = new CloudRunLitestreamProvisioner(cfg, client)
  return { client, provisioner }
}

describe('serviceIdForTenant', () => {
  it('sanitizes to a valid Cloud Run service id', () => {
    expect(serviceIdForTenant('t_user_a')).toBe('t-user-a')
    expect(serviceIdForTenant('T_USER')).toBe('t-user')
    expect(serviceIdForTenant('9abc')).toBe('t-9abc') // must start with a letter
    expect(serviceIdForTenant('__weird__')).toBe('weird') // leading/trailing junk stripped
  })
})

describe('CloudRunLitestreamProvisioner', () => {
  it('provisions a service with image, plan env, R2/Litestream wiring, scale-to-zero', async () => {
    const { client, provisioner } = setup()
    const h = await provisioner.provision(spec())
    expect(h).toMatchObject({
      tenantId: 't_user_a',
      substrateRef: 'xnet-cloud-0/us-central1/t-user-a',
      region: 'us-central1',
      targetVersion: '1.0.0',
      state: 'running'
    })
    expect(h.hubUrl).toContain('t-user-a')

    const svc = await client.get(REF)
    expect(svc?.image).toBe('us-docker.pkg.dev/xnet-cloud-0/hub:1.0.0')
    expect(svc?.env).toMatchObject({
      HUB_PLAN: 'signed-token',
      LITESTREAM: '1',
      LITESTREAM_PATH: 't/t_user_a/db',
      R2_BUCKET: 'xnet-hub-data',
      R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'AKID',
      R2_SECRET_ACCESS_KEY: 'SECRET'
    })
    expect(svc?.minInstances).toBe(0)
  })

  it('injects LITESTREAM_RESTORE only when reactivating a cold tenant', async () => {
    const { client, provisioner } = setup()
    await provisioner.provision(spec({ tenantId: 't_b', restoreFromR2: 't/t_b/db' }))
    const svc = await client.get({ ...REF, service: 't-b' })
    expect(svc?.env.LITESTREAM_RESTORE).toBe('t/t_b/db')

    await provisioner.provision(spec())
    expect((await client.get(REF))?.env.LITESTREAM_RESTORE).toBeUndefined()
  })

  it('keeps one warm instance for the always-warm tier', async () => {
    const { client, provisioner } = setup()
    await provisioner.provision(
      spec({ tenantId: 't_team', entitlements: resolveEntitlements('team') })
    )
    expect((await client.get({ ...REF, service: 't-team' }))?.minInstances).toBe(1)
  })

  it('upgrades the image while preserving env', async () => {
    const { client, provisioner } = setup()
    const h0 = await provisioner.provision(spec())
    const h1 = await provisioner.upgrade(h0.substrateRef, '2.0.0')
    expect(h1.targetVersion).toBe('2.0.0')
    const svc = await client.get(REF)
    expect(svc?.image).toBe('us-docker.pkg.dev/xnet-cloud-0/hub:2.0.0')
    expect(svc?.env.HUB_PLAN).toBe('signed-token') // unchanged
  })

  it('flips env while preserving the image and re-applying R2 wiring', async () => {
    const { client, provisioner } = setup()
    const h0 = await provisioner.provision(spec())
    const h1 = await provisioner.setEnv(h0.substrateRef, { HUB_PLAN: 'new-token' })
    expect(h1.targetVersion).toBe('1.0.0') // image/tag preserved
    const svc = await client.get(REF)
    expect(svc?.image).toBe('us-docker.pkg.dev/xnet-cloud-0/hub:1.0.0')
    expect(svc?.env.HUB_PLAN).toBe('new-token')
    expect(svc?.env.R2_BUCKET).toBe('xnet-hub-data') // re-applied
  })

  it('sleep scales to zero and reports sleeping', async () => {
    const { client, provisioner } = setup()
    const h0 = await provisioner.provision(
      spec({ tenantId: 't_team', entitlements: resolveEntitlements('team') })
    )
    const h1 = await provisioner.sleep(h0.substrateRef)
    expect(h1.state).toBe('sleeping')
    expect((await client.get({ ...REF, service: 't-team' }))?.minInstances).toBe(0)
  })

  it('destroys the service and frees its shard slot', async () => {
    const { client, provisioner } = setup()
    const h = await provisioner.provision(spec())
    await provisioner.destroy(h.substrateRef)
    expect(await client.get(REF)).toBeNull()
    expect(await provisioner.get(h.substrateRef)).toBeNull()
  })

  it('throws UnknownTenantError for upgrade/setEnv on a missing service', async () => {
    const { provisioner } = setup()
    const missing = 'xnet-cloud-0/us-central1/missing'
    await expect(provisioner.upgrade(missing, '2.0.0')).rejects.toThrow(UnknownTenantError)
    await expect(provisioner.setEnv(missing, {})).rejects.toThrow(UnknownTenantError)
    expect(await provisioner.get(missing)).toBeNull()
  })

  it('rejects a malformed substrateRef', async () => {
    const { provisioner } = setup()
    await expect(provisioner.get('not-a-ref')).rejects.toThrow(/Malformed/)
  })

  it('shards across projects at the per-project cap', async () => {
    const { provisioner } = setup({ ...config, servicesPerProject: 2 })
    const a = await provisioner.provision(spec({ tenantId: 'a' }))
    const b = await provisioner.provision(spec({ tenantId: 'b' }))
    const c = await provisioner.provision(spec({ tenantId: 'c' }))
    expect(a.substrateRef.startsWith('xnet-cloud-0/')).toBe(true)
    expect(b.substrateRef.startsWith('xnet-cloud-0/')).toBe(true)
    expect(c.substrateRef.startsWith('xnet-cloud-1/')).toBe(true) // rolled to the next shard
  })
})
