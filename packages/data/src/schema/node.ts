/**
 * Node - The universal container type for all data in xNet.
 *
 * A Node has only 4 universal fields. Everything else is defined by its schema.
 */

/**
 * Schema IRI - globally unique identifier for a schema.
 * Format: xnet://<authority>/<name>
 *
 * Examples:
 * - xnet://xnet.dev/Page (built-in)
 * - xnet://xnet.dev/Task (built-in)
 * - xnet://acme-corp.com/Project (organization)
 * - xnet://did:key:z6Mk.../Recipe (personal)
 */
export type SchemaIRI = `xnet://${string}/${string}`

/**
 * DID - Decentralized Identifier for user identity.
 */
export type DID = `did:key:${string}`

/**
 * The minimal universal Node interface.
 *
 * Only 4 fields are universal - everything else is schema-defined:
 * - id: Unique identifier
 * - schemaId: What type of node (IRI)
 * - createdAt: When created (for sync/attribution)
 * - createdBy: Who created it (for sync/attribution)
 */
export interface Node {
  /** Unique identifier for this node */
  id: string

  /** Schema IRI defining what type this node is */
  schemaId: SchemaIRI

  /** Unix timestamp (ms) when this node was created */
  createdAt: number

  /** DID of the user who created this node */
  createdBy: DID

  /** All other fields are schema-defined */
  [key: string]: unknown
}

/**
 * Type guard to check if a value is a valid Node.
 */
export function isNode(value: unknown): value is Node {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.schemaId === 'string' &&
    obj.schemaId.startsWith('xnet://') &&
    typeof obj.createdAt === 'number' &&
    typeof obj.createdBy === 'string' &&
    obj.createdBy.startsWith('did:key:')
  )
}

/**
 * Create a new node ID.
 * Format: {schema-short-name}-{timestamp}-{random}
 */
export function createNodeId(schemaName?: string): string {
  const prefix = schemaName?.toLowerCase().slice(0, 8) || 'node'
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}`
}
