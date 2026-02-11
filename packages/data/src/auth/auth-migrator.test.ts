import type { DID } from '@xnet/core'
import type { PublicKeyResolver } from '@xnet/crypto'
import { describe, expect, it, vi } from 'vitest'
import { AuthMigrator, type EncryptionLayer } from './auth-migrator'
import { allow, role, PUBLIC } from './builders'
import { serializeAuthorization } from './serialize'

describe('AuthMigrator', () => {
  it('migrates schema nodes in batches and reports progress', async () => {
    const schemaIri = 'xnet://app/Task' as const
    const schema = createSchema(schemaIri)
    const nodes = [
      createNode('n-1', schemaIri, DID_A),
      createNode('n-2', schemaIri, DID_B),
      createNode('n-3', schemaIri, DID_A)
    ]

    const store = {
      get: vi.fn(async (id: string) => nodes.find((node) => node.id === id) ?? null),
      list: vi.fn(async () => nodes)
    }
    const schemaRegistry = {
      get: vi.fn(async () => ({ schema }))
    }
    const publicKeyResolver = {
      resolve: vi.fn(),
      resolveBatch: vi.fn(
        async (dids: DID[]) => new Map(dids.map((did) => [did, new Uint8Array(32)]))
      )
    } satisfies PublicKeyResolver
    const grantIndex = {
      findGrantsForResource: vi.fn(() => [])
    }
    const encryptionLayer = {
      encryptAndStoreNode: vi.fn(async () => undefined)
    } satisfies EncryptionLayer

    const progress: Array<[number, number]> = []
    const migrator = new AuthMigrator(
      store,
      schemaRegistry,
      publicKeyResolver,
      grantIndex,
      encryptionLayer
    )

    const result = await migrator.migrateSchema(schemaIri, {
      batchSize: 2,
      onProgress(done, total) {
        progress.push([done, total])
      }
    })

    expect(result).toEqual({ total: 3, migrated: 3, failed: 0, errors: [] })
    expect(progress).toEqual([
      [2, 3],
      [3, 3]
    ])
    expect(encryptionLayer.encryptAndStoreNode).toHaveBeenCalledTimes(3)
  })

  it('throws when schema has no authorization block', async () => {
    const schemaIri = 'xnet://app/Task' as const
    const store = {
      get: vi.fn(async () => null),
      list: vi.fn(async () => [])
    }
    const schemaRegistry = {
      get: vi.fn(async () => ({ schema: { ...createSchema(schemaIri), authorization: undefined } }))
    }

    const migrator = new AuthMigrator(
      store,
      schemaRegistry,
      createPublicKeyResolver(),
      { findGrantsForResource: () => [] },
      { encryptAndStoreNode: async () => undefined }
    )

    await expect(migrator.migrateSchema(schemaIri)).rejects.toThrow(
      `Schema ${schemaIri} has no authorization block`
    )
  })

  it('records per-node errors and continues migration', async () => {
    const schemaIri = 'xnet://app/Task' as const
    const nodes = [createNode('n-1', schemaIri, DID_A), createNode('n-2', schemaIri, DID_B)]

    const migrator = new AuthMigrator(
      {
        get: async (id: string) => nodes.find((node) => node.id === id) ?? null,
        list: async () => nodes
      },
      {
        get: async () => ({ schema: createSchema(schemaIri) })
      },
      createPublicKeyResolver(),
      { findGrantsForResource: () => [] },
      {
        encryptAndStoreNode: async (node) => {
          if (node.id === 'n-2') {
            throw new Error('boom')
          }
        }
      }
    )

    const result = await migrator.migrateSchema(schemaIri)
    expect(result.total).toBe(2)
    expect(result.migrated).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.errors).toEqual([{ nodeId: 'n-2', error: 'boom' }])
  })

  it('skips key resolution for PUBLIC recipient schemas', async () => {
    const schemaIri = 'xnet://app/PublicNote' as const
    const schema = createSchema(schemaIri, true)
    const node = createNode('n-1', schemaIri, DID_A)

    const publicKeyResolver = createPublicKeyResolver()
    const migrator = new AuthMigrator(
      {
        get: async () => node,
        list: async () => [node]
      },
      {
        get: async () => ({ schema })
      },
      publicKeyResolver,
      { findGrantsForResource: () => [] },
      { encryptAndStoreNode: async () => undefined }
    )

    await migrator.migrateSchema(schemaIri)
    expect(publicKeyResolver.resolveBatch).toHaveBeenCalledWith([])
  })
})

const DID_A = 'did:key:z6MkrA111111111111111111111111111111111111111111' as const
const DID_B = 'did:key:z6MkrB222222222222222222222222222222222222222222' as const

function createSchema(schemaIri: `xnet://${string}/${string}`, isPublic = false) {
  const authorization = serializeAuthorization({
    roles: {
      owner: role.creator()
    },
    actions: {
      read: isPublic ? PUBLIC : allow('owner'),
      write: allow('owner'),
      delete: allow('owner'),
      share: allow('owner')
    }
  })

  return {
    '@id': schemaIri,
    '@type': 'xnet://xnet.fyi/Schema' as const,
    name: 'Task',
    namespace: 'xnet://app/' as const,
    version: '1.0.0',
    properties: [],
    authorization
  }
}

function createNode(id: string, schemaId: `xnet://${string}/${string}`, createdBy: DID) {
  return {
    id,
    schemaId,
    properties: {},
    timestamps: {},
    deleted: false,
    createdAt: 1,
    createdBy,
    updatedAt: 1,
    updatedBy: createdBy
  }
}

function createPublicKeyResolver(): PublicKeyResolver {
  return {
    resolve: vi.fn(async () => new Uint8Array(32)),
    resolveBatch: vi.fn(
      async (dids: DID[]) => new Map(dids.map((did) => [did, new Uint8Array(32)]))
    )
  }
}
