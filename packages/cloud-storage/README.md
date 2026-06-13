# @xnetjs/cloud-storage

Server-only object-storage adapters for the managed fleet (Cloudflare R2 / S3), implementing the `@xnetjs/storage` `StorageAdapter` contract. See explorations 0175/0176.

> **Server-only.** This package wraps the AWS SDK and is never bundled into a client.

## Features

- **S3 / R2 adapter** -- `S3BlobAdapter`: a `StorageAdapter` backed by any S3-compatible object store (Cloudflare R2, AWS S3)
- **Contract suite** -- `runStorageAdapterContract`: the shared behavioral test suite every `StorageAdapter` must pass, so cloud and local adapters stay interchangeable

## Usage

```typescript
import { S3BlobAdapter } from '@xnetjs/cloud-storage'

const storage = new S3BlobAdapter({
  bucket: 'my-tenant-bucket',
  endpoint: 'https://<account>.r2.cloudflarestorage.com',
  region: 'auto'
})

await storage.put('cid:blake3:...', bytes)
const blob = await storage.get('cid:blake3:...')
```

To verify a new adapter, run it through the shared contract:

```typescript
import { runStorageAdapterContract } from '@xnetjs/cloud-storage'

runStorageAdapterContract(
  'S3BlobAdapter',
  () =>
    new S3BlobAdapter({
      /* ... */
    })
)
```

## Modules

| Module          | Description                                 |
| --------------- | ------------------------------------------- |
| `s3-adapter.ts` | S3 / R2 `StorageAdapter` implementation     |
| `contract.ts`   | Shared `StorageAdapter` contract test suite |

## Testing

```bash
pnpm --filter @xnetjs/cloud-storage test
```

Tests run with no AWS credentials — the S3 client is mocked with [`aws-sdk-client-mock`](https://github.com/m-radzikowski/aws-sdk-client-mock).
