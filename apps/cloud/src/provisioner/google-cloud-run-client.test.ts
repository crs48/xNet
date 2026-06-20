import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import {
  GoogleCloudRunClient,
  cloudRunProvisionerFromEnv,
  type RunService,
  type RunServicesClient
} from './google-cloud-run-client'

/** A fake v2 ServicesClient that stores one service and records call args. */
function fakeRun(initial?: RunService) {
  let stored: RunService | undefined = initial
  const calls: {
    create?: unknown
    update?: unknown
    get?: unknown
    delete?: unknown
    setIamPolicy?: unknown
  } = {}
  const op = (svc: RunService) => ({ promise: async (): Promise<[RunService]> => [svc] })
  const client: RunServicesClient = {
    async setIamPolicy(req) {
      calls.setIamPolicy = req
      return [req.policy]
    },
    async createService(req) {
      calls.create = req
      stored = {
        name: `${req.parent}/services/${req.serviceId}`,
        uri: `https://${req.serviceId}.run.app`,
        ...req.service
      }
      return [op(stored)]
    },
    async updateService(req) {
      calls.update = req
      stored = { uri: stored?.uri ?? 'https://x.run.app', ...req.service }
      return [op(stored)]
    },
    async getService(req) {
      calls.get = req
      if (!stored) {
        const err = new Error('not found') as Error & { code?: number }
        err.code = 5
        throw err
      }
      return [stored]
    },
    async deleteService(req) {
      calls.delete = req
      stored = undefined
      return [op({})]
    }
  }
  return { client, calls }
}

describe('GoogleCloudRunClient proto mapping', () => {
  it('create maps env→array, image, minInstances, parent/serviceId; reads the handle back', async () => {
    const { client, calls } = fakeRun()
    const svc = await new GoogleCloudRunClient(client).create({
      project: 'xnet-cloud-0',
      region: 'us-central1',
      service: 't-a',
      image: 'repo/hub:1.0.0',
      env: { HUB_PLAN: 'tok', LITESTREAM: '1' },
      minInstances: 0
    })
    const create = calls.create as {
      parent: string
      serviceId: string
      service: RunService
    }
    expect(create.parent).toBe('projects/xnet-cloud-0/locations/us-central1')
    expect(create.serviceId).toBe('t-a')
    expect(create.service.template?.containers?.[0]?.image).toBe('repo/hub:1.0.0')
    expect(create.service.template?.containers?.[0]?.env).toContainEqual({
      name: 'HUB_PLAN',
      value: 'tok'
    })
    expect(create.service.template?.scaling?.minInstanceCount).toBe(0)
    // Hub is made publicly invokable (it self-auths); else Cloud Run IAM 403s it.
    expect(calls.setIamPolicy).toMatchObject({
      resource: 'projects/xnet-cloud-0/locations/us-central1/services/t-a',
      policy: { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] }
    })
    expect(svc).toEqual({
      uri: 'https://t-a.run.app',
      image: 'repo/hub:1.0.0',
      env: { HUB_PLAN: 'tok', LITESTREAM: '1' },
      minInstances: 0
    })
  })

  it('pins tenant hubs to <repo>/xnet-hub:<tag> — never the bare repo root (AR rejects that)', async () => {
    const { client, calls } = fakeRun()
    const env = {
      GCP_PROJECT_PREFIX: 'xnet-cloud',
      GCP_REGION: 'us-central1',
      GCP_ARTIFACT_REGISTRY: 'us-docker.pkg.dev/xnet-cloud-0/hub',
      R2_BUCKET: 'b',
      R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'AKID',
      R2_SECRET_ACCESS_KEY: 'SECRET'
    } as unknown as NodeJS.ProcessEnv
    const provisioner = cloudRunProvisionerFromEnv(env, client)
    if (!provisioner) throw new Error('expected a provisioner')
    await provisioner.provision({
      tenantId: 't_user_a',
      entitlements: resolveEntitlements('personal'),
      targetVersion: '1.0.0',
      env: { HUB_PLAN: 'tok' }
    })
    const create = calls.create as { service: RunService }
    expect(create.service.template?.containers?.[0]?.image).toBe(
      'us-docker.pkg.dev/xnet-cloud-0/hub/xnet-hub:1.0.0'
    )
  })

  it('get returns null on NOT_FOUND (gRPC code 5)', async () => {
    const { client } = fakeRun()
    expect(
      await new GoogleCloudRunClient(client).get({ project: 'p', region: 'r', service: 's' })
    ).toBeNull()
  })

  it('update targets the full service name with the new spec; delete removes it', async () => {
    const { client, calls } = fakeRun()
    const c = new GoogleCloudRunClient(client)
    await c.create({
      project: 'p',
      region: 'r',
      service: 's',
      image: 'repo:1',
      env: {},
      minInstances: 0
    })
    await c.update({
      project: 'p',
      region: 'r',
      service: 's',
      image: 'repo:2',
      env: { A: 'b' },
      minInstances: 1
    })
    const update = calls.update as { service: RunService }
    expect(update.service.name).toBe('projects/p/locations/r/services/s')
    expect(update.service.template?.containers?.[0]?.image).toBe('repo:2')
    await c.delete({ project: 'p', region: 'r', service: 's' })
    expect(await c.get({ project: 'p', region: 'r', service: 's' })).toBeNull()
  })
})
