import type { Schema } from '../schema'
import type { SchemaIRI } from '../schema/node'
import type { NodeState } from '../store'
import type { GrantIndexReader } from './recipients'
import type { DID } from '@xnetjs/core'
import type { PublicKeyResolver } from '@xnetjs/crypto'
import { computeRecipients } from './recipients'

export interface EncryptionLayer {
  encryptAndStoreNode(node: NodeState, recipientKeys: Map<DID, Uint8Array>): Promise<void>
}

export interface MigrationOptions {
  batchSize?: number
  onProgress?: (done: number, total: number) => void
}

export interface MigrationError {
  nodeId: string
  error: string
}

export interface MigrationResult {
  total: number
  migrated: number
  failed: number
  errors: MigrationError[]
}

export interface AuthMigratorStore {
  get(nodeId: string): Promise<NodeState | null>
  list(options?: { schemaId?: string; includeDeleted?: boolean }): Promise<NodeState[]>
}

export interface AuthMigratorSchemaRegistry {
  get(schemaId: SchemaIRI): Promise<{ schema: Schema } | undefined>
}

export class AuthMigrator {
  constructor(
    private readonly store: AuthMigratorStore,
    private readonly schemaRegistry: AuthMigratorSchemaRegistry,
    private readonly publicKeyResolver: PublicKeyResolver,
    private readonly grantIndex: GrantIndexReader,
    private readonly encryptionLayer: EncryptionLayer
  ) {}

  async migrateSchema(
    schemaIri: SchemaIRI,
    options: MigrationOptions = {}
  ): Promise<MigrationResult> {
    const schema = await this.schemaRegistry.get(schemaIri)
    if (!schema?.schema.authorization) {
      throw new Error(`Schema ${schemaIri} has no authorization block`)
    }

    const nodes = await this.store.list({ schemaId: schemaIri, includeDeleted: false })
    const total = nodes.length
    const batchSize = Math.max(1, options.batchSize ?? 100)

    let migrated = 0
    let failed = 0
    const errors: MigrationError[] = []

    for (let index = 0; index < nodes.length; index += batchSize) {
      const batch = nodes.slice(index, index + batchSize)

      for (const node of batch) {
        try {
          const recipients = await computeRecipients(schema.schema, node, {
            getNode: (nodeId) => this.store.get(nodeId),
            getSchema: (schemaId) => this.resolveSchema(schemaId),
            grantIndex: this.grantIndex
          })

          const didRecipients = recipients.filter(
            (recipient): recipient is DID => recipient !== 'PUBLIC'
          )
          const recipientKeys = await this.publicKeyResolver.resolveBatch(didRecipients)

          await this.encryptionLayer.encryptAndStoreNode(node, recipientKeys)
          migrated++
        } catch (error) {
          failed++
          errors.push({
            nodeId: node.id,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      options.onProgress?.(migrated + failed, total)
    }

    return { total, migrated, failed, errors }
  }

  private async resolveSchema(schemaId: SchemaIRI): Promise<Schema | undefined> {
    const schema = await this.schemaRegistry.get(schemaId)
    return schema?.schema
  }
}
