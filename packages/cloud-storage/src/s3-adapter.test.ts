import type { ContentId } from '@xnetjs/core'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { afterEach, describe, expect, it } from 'vitest'
import { runStorageAdapterContract } from './contract'
import { S3BlobAdapter } from './s3-adapter'

// A small STATEFUL in-memory S3, wired through aws-sdk-client-mock. This exercises
// the adapter's real command construction, key mapping, body transform, and error
// mapping against a backend that actually remembers objects — no account, no Docker.
const s3Mock = mockClient(S3Client)
const store = new Map<string, Uint8Array>()

const notFoundErr = (name: string) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } })

function wireStatefulS3(): void {
  s3Mock.reset()
  s3Mock.on(PutObjectCommand).callsFake((input) => {
    store.set(String(input.Key), input.Body as Uint8Array)
    return {}
  })
  s3Mock.on(GetObjectCommand).callsFake((input) => {
    const key = String(input.Key)
    if (!store.has(key)) throw notFoundErr('NoSuchKey')
    const data = store.get(key)!
    return { Body: { transformToByteArray: async () => data } }
  })
  s3Mock.on(HeadObjectCommand).callsFake((input) => {
    if (!store.has(String(input.Key))) throw notFoundErr('NotFound')
    return {}
  })
  s3Mock.on(ListObjectsV2Command).callsFake((input) => {
    const prefix = input.Prefix ?? ''
    const Contents = [...store.keys()].filter((k) => k.startsWith(prefix)).map((Key) => ({ Key }))
    return { Contents, IsTruncated: false }
  })
  s3Mock.on(DeleteObjectsCommand).callsFake((input) => {
    for (const obj of input.Delete?.Objects ?? []) store.delete(String(obj.Key))
    return { Deleted: [] }
  })
}

afterEach(() => {
  store.clear()
  s3Mock.reset()
})

// The real-local side of the parity check — same contract as MemoryAdapter.
runStorageAdapterContract('S3BlobAdapter (stateful mock)', async () => {
  store.clear()
  wireStatefulS3()
  return new S3BlobAdapter({
    bucket: 'test-bucket',
    prefix: 't/acme',
    clientConfig: { region: 'us-east-1' }
  })
})

describe('S3BlobAdapter wiring', () => {
  const cid = (n: string): ContentId => `cid:blake3:${n}`

  it('maps a blob to a prefixed key in the right bucket', async () => {
    wireStatefulS3()
    const a = new S3BlobAdapter({
      bucket: 'b',
      prefix: 't/acme/',
      clientConfig: { region: 'us-east-1' }
    })
    await a.setBlob(cid('z'), new Uint8Array([1]))
    const put = s3Mock.commandCalls(PutObjectCommand)[0]
    expect(put.args[0].input.Bucket).toBe('b')
    expect(put.args[0].input.Key).toBe('t/acme/cid:blake3:z') // trailing slash on prefix trimmed
  })

  it('returns null on NoSuchKey and false on HeadObject NotFound', async () => {
    wireStatefulS3()
    const a = new S3BlobAdapter({ bucket: 'b', clientConfig: { region: 'us-east-1' } })
    expect(await a.getBlob(cid('nope'))).toBeNull()
    expect(await a.hasBlob(cid('nope'))).toBe(false)
  })

  it('rejects construction without a bucket', () => {
    expect(() => new S3BlobAdapter({ bucket: '' })).toThrow(/requires a bucket/)
  })
})
