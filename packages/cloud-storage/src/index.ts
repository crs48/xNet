/**
 * @xnetjs/cloud-storage — public API.
 *
 * Server-only object-storage adapters (Cloudflare R2 / S3) for the managed fleet,
 * plus the shared `StorageAdapter` contract suite (explorations 0175/0176).
 */

export { S3BlobAdapter, type S3BlobAdapterOptions } from './s3-adapter'
export { runStorageAdapterContract } from './contract'
