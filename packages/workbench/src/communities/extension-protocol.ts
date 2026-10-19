import { TaggedError } from '@xnetjs/core'

export class ExtensionAccessError extends TaggedError<'ExtensionAccessError'> {
  readonly _tag = 'ExtensionAccessError' as const
  constructor(
    readonly code: 'denied' | 'invalid' | 'revoked' | 'quota' | 'conflict' | 'unsupported',
    message: string
  ) {
    super(message)
  }
}
export const EXTENSION_OPERATIONS = {
  'data.mutate': { version: 1, maxBytes: 16_384, maxOperations: 20 },
  'data.undo': { version: 1, maxBytes: 1024, maxOperations: 1 }
} as const
export type ExtensionOperation =
  | { type: 'create'; schemaId: string; id?: string; properties: Record<string, unknown> }
  | { type: 'update'; nodeId: string; properties: Record<string, unknown> }
  | { type: 'delete' | 'restore'; nodeId: string }
export type ExtensionRequest =
  | { version: 1; id: string; operation: 'data.mutate'; operations: ExtensionOperation[] }
  | { version: 1; id: string; operation: 'data.undo'; receipt: string }
export function object(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new ExtensionAccessError('invalid', 'Expected a plain object.')
  return value as Record<string, unknown>
}
export function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new ExtensionAccessError('invalid', 'Unsupported request field.')
}
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(value)
export function decodeExtensionRequest(input: unknown): ExtensionRequest {
  if (new TextEncoder().encode(JSON.stringify(input)).length > 16_384)
    throw new ExtensionAccessError('quota', 'Request exceeds 16 KiB.')
  const value = object(input)
  if (value.version !== 1 || !identifier(value.id))
    throw new ExtensionAccessError('invalid', 'Unsupported request version or identifier.')
  if (value.operation === 'data.undo') {
    keys(value, ['version', 'id', 'operation', 'receipt'])
    if (!identifier(value.receipt)) throw new ExtensionAccessError('invalid', 'Invalid receipt.')
    return value as ExtensionRequest
  }
  if (value.operation !== 'data.mutate')
    throw new ExtensionAccessError('unsupported', 'This operation is not available to extensions.')
  keys(value, ['version', 'id', 'operation', 'operations'])
  if (!Array.isArray(value.operations) || !value.operations.length || value.operations.length > 20)
    throw new ExtensionAccessError('quota', 'Use between one and twenty operations.')
  for (const raw of value.operations) {
    const op = object(raw)
    if (op.type === 'create') {
      keys(op, ['type', 'schemaId', 'id', 'properties'])
      if (typeof op.schemaId !== 'string' || (op.id !== undefined && !identifier(op.id)))
        throw new ExtensionAccessError('invalid', 'Invalid schema or identifier.')
      object(op.properties)
    } else if (op.type === 'update') {
      keys(op, ['type', 'nodeId', 'properties'])
      if (!identifier(op.nodeId))
        throw new ExtensionAccessError('invalid', 'Invalid record identifier.')
      object(op.properties)
    } else if (op.type === 'delete' || op.type === 'restore') {
      keys(op, ['type', 'nodeId'])
      if (!identifier(op.nodeId))
        throw new ExtensionAccessError('invalid', 'Invalid record identifier.')
    } else throw new ExtensionAccessError('unsupported', 'Unsupported mutation.')
  }
  return value as ExtensionRequest
}

/** Coverage is explicit. Unknown imports/exports never fall back to host modules. */
export const EXTENSION_API_COVERAGE = {
  useQuery: 'scoped live properties',
  useMutate: 'private task commands',
  useState: 'worker React',
  useEffect: 'worker React',
  useNode: 'unsupported: requires scoped document handle',
  useXNet: 'denied: raw host context',
  useNodeStore: 'denied: raw storage',
  useDataBridge: 'denied: internal capability',
  documents: 'unsupported: scoped editor not implemented',
  canvas: 'unsupported: scoped canvas not implemented',
  database: 'unsupported: scoped database not implemented',
  assets: 'unsupported: asset broker not implemented',
  schemas: 'unsupported: namespace/migration broker not implemented',
  network: 'denied: no egress grant',
  agents: 'denied: separate disclosure approval required',
  native: 'denied: no device authority',
  keys: 'denied: host only',
  sync: 'denied: host only',
  background: 'unsupported: no persisted delegation',
  storage: 'denied: no guest persistence'
} as const
