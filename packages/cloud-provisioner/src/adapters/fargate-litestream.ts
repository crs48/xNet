/**
 * @xnetjs/cloud-provisioner — AWS Fargate + Litestream adapter (skeleton).
 *
 * The AWS-native fallback from exploration 0175, for AWS-first or BYOC customers:
 * ECS Fargate for compute (scale-to-zero via task stop/start), an EFS/EBS volume
 * per tenant with Litestream streaming the SQLite WAL to S3, and S3 for blobs.
 * Lifecycle methods are unbuilt placeholders pending real AWS wiring.
 */

import { NotImplementedError, type HubHandle, type ProvisionSpec, type Provisioner } from '../types'

export interface FargateLitestreamConfig {
  /** ECS cluster ARN the tenant tasks run in. */
  cluster: string
  /** AWS region. */
  region: string
  /** ECR image repository for the hub. */
  imageRepository: string
  /** S3 bucket for Litestream WAL replication + blobs. */
  s3Bucket: string
}

export class FargateLitestreamProvisioner implements Provisioner {
  readonly substrate = 'fargate-litestream'

  constructor(protected readonly config: FargateLitestreamConfig) {}

  async provision(_spec: ProvisionSpec): Promise<HubHandle> {
    // TODO(0175): register an ECS task def (image @ targetVersion + Litestream
    // sidecar), create the EFS access point / S3 prefix, run the task.
    throw new NotImplementedError(this.substrate, 'provision')
  }

  async upgrade(_substrateRef: string, _targetVersion: string): Promise<HubHandle> {
    throw new NotImplementedError(this.substrate, 'upgrade')
  }

  async setEnv(_substrateRef: string, _env: Record<string, string>): Promise<HubHandle> {
    throw new NotImplementedError(this.substrate, 'setEnv')
  }

  async sleep(_substrateRef: string): Promise<HubHandle> {
    throw new NotImplementedError(this.substrate, 'sleep')
  }

  async destroy(_substrateRef: string): Promise<void> {
    throw new NotImplementedError(this.substrate, 'destroy')
  }

  async get(_substrateRef: string): Promise<HubHandle | null> {
    throw new NotImplementedError(this.substrate, 'get')
  }
}
