/**
 * @xnetjs/cloud-storage — S3 / Cloudflare R2 blob adapter.
 *
 * Implements the `@xnetjs/storage` `StorageAdapter` against any S3-compatible
 * object store. Cloudflare R2 is S3-compatible, so the same adapter targets R2
 * (zero egress — exploration 0175) or AWS S3 by changing the endpoint. Server-only;
 * the AWS SDK never reaches a client bundle because no client package imports this.
 *
 * Testable with no account or Docker: pass a mocked `S3Client`
 * (`aws-sdk-client-mock`) or run against `s3rver`/MinIO (exploration 0176).
 */

import type { ContentId } from '@xnetjs/core'
import type { StorageAdapter } from '@xnetjs/storage'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from '@aws-sdk/client-s3'

/** Structural subset of `@xnetjs/storage`'s telemetry collector (not re-exported there). */
interface StorageTelemetry {
  reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): void
  reportUsage(metricName: string, value: number): void
  reportCrash(error: Error, context?: { codeNamespace?: string }): void
}

export interface S3BlobAdapterOptions {
  bucket: string
  /** Key prefix all blobs live under (per-tenant isolation), e.g. `t/<tenantId>`. */
  prefix?: string
  /** Pre-constructed client (tests inject a mocked one); otherwise built from `clientConfig`. */
  client?: S3Client
  /** Client config — set `endpoint` + `forcePathStyle: true` for R2/MinIO/s3rver. */
  clientConfig?: S3ClientConfig
  telemetry?: StorageTelemetry
}

const notFound = (err: unknown): boolean => {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
}

const toBytes = async (body: unknown): Promise<Uint8Array> => {
  // The AWS SDK stream exposes transformToByteArray() in Node and browsers.
  const stream = body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
  if (stream?.transformToByteArray) return stream.transformToByteArray()
  throw new Error('S3 response body is not a readable stream')
}

export class S3BlobAdapter implements StorageAdapter {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly prefix: string
  private readonly telemetry?: StorageTelemetry

  constructor(options: S3BlobAdapterOptions) {
    if (!options.bucket) throw new Error('S3BlobAdapter requires a bucket')
    this.client = options.client ?? new S3Client(options.clientConfig ?? {})
    this.bucket = options.bucket
    this.prefix = options.prefix ? options.prefix.replace(/\/+$/, '') : ''
    this.telemetry = options.telemetry
  }

  private key(cid: ContentId): string {
    return this.prefix ? `${this.prefix}/${cid}` : cid
  }

  async open(): Promise<void> {}
  async close(): Promise<void> {
    this.client.destroy()
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    const start = this.telemetry ? Date.now() : 0
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(cid) })
      )
      const bytes = await toBytes(res.Body)
      this.telemetry?.reportPerformance('storage.getBlob', Date.now() - start)
      this.telemetry?.reportUsage('storage.read', 1)
      return bytes
    } catch (err) {
      if (notFound(err)) return null
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'cloud-storage.S3BlobAdapter.getBlob'
      })
      throw err
    }
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    const start = this.telemetry ? Date.now() : 0
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.key(cid), Body: data })
    )
    this.telemetry?.reportPerformance('storage.setBlob', Date.now() - start)
    this.telemetry?.reportUsage('storage.write', 1)
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(cid) }))
      return true
    } catch (err) {
      if (notFound(err)) return false
      throw err
    }
  }

  /** Delete every blob under this adapter's prefix. */
  async clear(): Promise<void> {
    let token: string | undefined
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix ? `${this.prefix}/` : undefined,
          ContinuationToken: token
        })
      )
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key)
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } })
        )
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined
    } while (token)
  }
}
