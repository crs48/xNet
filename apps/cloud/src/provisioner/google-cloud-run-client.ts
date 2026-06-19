/**
 * xNet Cloud — the real Cloud Run client (`@google-cloud/run` v2).
 *
 * Implements the substrate-agnostic `CloudRunClient` port that
 * `CloudRunLitestreamProvisioner` drives. The SDK is reached through a narrow
 * `RunServicesClient` interface so the proto-mapping logic is unit-testable with a
 * fake, and `@xnetjs/cloud` stays SDK-free (exploration 0196). The provisioner
 * lifecycle itself is already tested with FakeCloudRunClient; this wrapper should
 * get a live smoke test at first deploy.
 */

import { ServicesClient } from '@google-cloud/run'
import {
  CloudRunLitestreamProvisioner,
  type CloudRunClient,
  type CloudRunRef,
  type CloudRunService,
  type CloudRunUpsert,
  type Provisioner
} from '@xnetjs/cloud/provisioner'

/** The slice of `google.cloud.run.v2.IService` we read/write. */
export interface RunService {
  name?: string | null
  uri?: string | null
  template?: {
    containers?: Array<{
      image?: string | null
      env?: Array<{ name?: string | null; value?: string | null }> | null
    }> | null
    scaling?: { minInstanceCount?: number | null } | null
  } | null
}

interface RunOperation {
  promise(): Promise<[RunService, ...unknown[]]>
}

/** The slice of the v2 `ServicesClient` we call (mock it in tests). */
export interface RunServicesClient {
  createService(req: {
    parent: string
    serviceId: string
    service: RunService
  }): Promise<[RunOperation, ...unknown[]]>
  updateService(req: { service: RunService }): Promise<[RunOperation, ...unknown[]]>
  getService(req: { name: string }): Promise<[RunService, ...unknown[]]>
  deleteService(req: { name: string }): Promise<[RunOperation, ...unknown[]]>
}

/** gRPC NOT_FOUND status code. */
const isNotFound = (err: unknown): boolean => (err as { code?: number }).code === 5

export class GoogleCloudRunClient implements CloudRunClient {
  constructor(
    private readonly client: RunServicesClient = new ServicesClient() as unknown as RunServicesClient
  ) {}

  private name(ref: CloudRunRef): string {
    return `projects/${ref.project}/locations/${ref.region}/services/${ref.service}`
  }

  private spec(args: CloudRunUpsert): RunService {
    return {
      template: {
        containers: [
          {
            image: args.image,
            env: Object.entries(args.env).map(([name, value]) => ({ name, value }))
          }
        ],
        scaling: { minInstanceCount: args.minInstances }
      }
    }
  }

  private read(svc: RunService): CloudRunService {
    const container = svc.template?.containers?.[0] ?? {}
    const env: Record<string, string> = {}
    for (const e of container.env ?? []) if (e?.name) env[e.name] = e.value ?? ''
    return {
      uri: svc.uri ?? '',
      image: container.image ?? '',
      env,
      minInstances: svc.template?.scaling?.minInstanceCount ?? 0
    }
  }

  async create(args: CloudRunUpsert): Promise<CloudRunService> {
    const [op] = await this.client.createService({
      parent: `projects/${args.project}/locations/${args.region}`,
      serviceId: args.service,
      service: this.spec(args)
    })
    const [svc] = await op.promise()
    return this.read(svc)
  }

  async update(args: CloudRunUpsert): Promise<CloudRunService> {
    const [op] = await this.client.updateService({
      service: { name: this.name(args), ...this.spec(args) }
    })
    const [svc] = await op.promise()
    return this.read(svc)
  }

  async get(ref: CloudRunRef): Promise<CloudRunService | null> {
    try {
      const [svc] = await this.client.getService({ name: this.name(ref) })
      return this.read(svc)
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async delete(ref: CloudRunRef): Promise<void> {
    const [op] = await this.client.deleteService({ name: this.name(ref) })
    await op.promise()
  }
}

/** Build the real Cloud Run provisioner from env, or null when GCP/R2 isn't fully configured. */
export function cloudRunProvisionerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  client?: RunServicesClient
): Provisioner | null {
  const {
    GCP_PROJECT_PREFIX,
    GCP_REGION,
    GCP_ARTIFACT_REGISTRY,
    R2_BUCKET,
    R2_ENDPOINT,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY
  } = env
  if (
    !GCP_PROJECT_PREFIX ||
    !GCP_REGION ||
    !GCP_ARTIFACT_REGISTRY ||
    !R2_BUCKET ||
    !R2_ENDPOINT ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY
  ) {
    return null
  }
  // `GCP_ARTIFACT_REGISTRY` is the Artifact Registry *repo* (e.g. .../hub); images
  // live under it by name. The provisioner pins tenant hubs to `<repo>/<name>:<tag>`,
  // so append the hub image name here (the control-plane image is likewise at
  // `<repo>/control-plane`). Pushing to the bare repo root is rejected by AR
  // ("Missing image name"). Override the name with HUB_IMAGE_NAME if needed.
  const hubImageName = env.HUB_IMAGE_NAME || 'xnet-hub'
  return new CloudRunLitestreamProvisioner(
    {
      projectPrefix: GCP_PROJECT_PREFIX,
      region: GCP_REGION,
      imageRepository: `${GCP_ARTIFACT_REGISTRY}/${hubImageName}`,
      r2Bucket: R2_BUCKET,
      r2Endpoint: R2_ENDPOINT,
      r2AccessKeyId: R2_ACCESS_KEY_ID,
      r2SecretAccessKey: R2_SECRET_ACCESS_KEY
    },
    new GoogleCloudRunClient(client)
  )
}
