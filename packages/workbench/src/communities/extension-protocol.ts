import type { QueryOptions } from '@xnetjs/data-bridge'
import { TaggedError } from '@xnetjs/core'

export class ExtensionAccessError extends TaggedError<'ExtensionAccessError'> {
  readonly _tag = 'ExtensionAccessError' as const
  constructor(
    readonly code: ExtensionErrorCode,
    message: string
  ) {
    super(message)
  }
}
export const EXTENSION_ERROR_CODES = [
  'denied',
  'invalid',
  'revoked',
  'quota',
  'conflict',
  'unsupported',
  'cancelled',
  'timeout',
  'unavailable'
] as const
export type ExtensionErrorCode = (typeof EXTENSION_ERROR_CODES)[number]
export interface ExtensionFailure {
  version: 1
  _tag: 'ExtensionAccessError'
  code: ExtensionErrorCode
  message: string
}
/** Only deliberate public errors cross the port. Never serialize a host stack or cause. */
export function encodeExtensionFailure(error: unknown): ExtensionFailure {
  return {
    version: 1,
    _tag: 'ExtensionAccessError',
    code: error instanceof ExtensionAccessError ? error.code : 'unavailable',
    message:
      error instanceof ExtensionAccessError
        ? error.message.slice(0, 300)
        : 'The operation could not be completed. Refresh the preview before retrying.'
  }
}

/** Electron wraps storage failures in an untyped IPC error; never show that wrapper in chat. */
export function extensionUndoMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.message.endsWith('Conditional transaction conflict: a record changed before commit.')
  )
    return 'Cannot undo: a task changed after this edit. This undo changed no tasks.'
  return `Could not undo this edit. ${encodeExtensionFailure(error).message}`
}
export function decodeExtensionFailure(input: unknown): ExtensionAccessError {
  const value = object(input)
  keys(value, ['version', '_tag', 'code', 'message'])
  if (
    value.version !== 1 ||
    value._tag !== 'ExtensionAccessError' ||
    !EXTENSION_ERROR_CODES.includes(value.code as ExtensionErrorCode) ||
    typeof value.message !== 'string' ||
    value.message.length > 300
  )
    throw new ExtensionAccessError('invalid', 'Invalid failure response.')
  return new ExtensionAccessError(value.code as ExtensionErrorCode, value.message)
}

/** Bound work before JSON serialization; structured-clone accepts cycles, BigInts and typed arrays. */
export function assertExtensionMessage(input: unknown, maxBytes = 66_000): void {
  const stack: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }]
  const seen = new Set<object>()
  let count = 0,
    characters = 0
  const consume = (size: number) => {
    characters += size
    if (characters > maxBytes)
      throw new ExtensionAccessError('quota', 'Extension message exceeds its byte limit.')
  }
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (++count > 4096 || depth > 32)
      throw new ExtensionAccessError('quota', 'Extension message exceeds its structure limit.')
    if (value === undefined || value === null || typeof value === 'boolean') continue
    if (typeof value === 'number' && Number.isFinite(value)) continue
    if (typeof value === 'string') {
      consume(value.length)
      continue
    }
    if (typeof value !== 'object' || seen.has(value))
      throw new ExtensionAccessError('invalid', 'Extension messages must be finite JSON values.')
    seen.add(value)
    if (Array.isArray(value)) {
      if (value.length + stack.length + count > 4096)
        throw new ExtensionAccessError('quota', 'Extension message exceeds its structure limit.')
      for (let index = 0; index < value.length; index++)
        stack.push({ value: value[index], depth: depth + 1 })
    } else {
      object(value)
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue
        consume(key.length)
        if (stack.length + count >= 4096)
          throw new ExtensionAccessError('quota', 'Extension message exceeds its structure limit.')
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!('value' in descriptor))
          throw new ExtensionAccessError('invalid', 'Extension messages cannot contain accessors.')
        stack.push({ value: descriptor.value, depth: depth + 1 })
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(input)).length > maxBytes)
    throw new ExtensionAccessError('quota', 'Extension message exceeds its byte limit.')
}

export const EXTENSION_OPERATIONS = {
  'data.query': { version: 1, maxBytes: 4096, maxOperations: 1, deadlineMs: 5000 },
  'data.mutate': { version: 1, maxBytes: 16_384, maxOperations: 20, deadlineMs: 5000 },
  'data.undo': { version: 1, maxBytes: 1024, maxOperations: 1, deadlineMs: 5000 }
} as const
export type ExtensionOperation =
  | { type: 'create'; schemaId: string; id?: string; properties: Record<string, unknown> }
  | { type: 'update'; nodeId: string; properties: Record<string, unknown> }
  | { type: 'delete' | 'restore'; nodeId: string }
export type ExtensionMutationRequest =
  | { version: 1; id: string; operation: 'data.mutate'; operations: ExtensionOperation[] }
  | { version: 1; id: string; operation: 'data.undo'; receipt: string }
export type ExtensionQueryRequest = {
  version: 1
  id: string
  operation: 'data.query'
  schemaId: string
  options: QueryOptions
}
export type ExtensionRequest = ExtensionMutationRequest | ExtensionQueryRequest
function queryOptions(input: unknown): void {
  const value = object(input)
  keys(value, [
    'nodeId',
    'where',
    'orderBy',
    'limit',
    'offset',
    'page',
    'includeDeleted',
    'source',
    'mode'
  ])
  if (
    (value.nodeId !== undefined && !identifier(value.nodeId)) ||
    (value.includeDeleted !== undefined && value.includeDeleted !== false) ||
    (value.offset !== undefined && value.offset !== 0) ||
    (value.mode !== undefined && value.mode !== 'local') ||
    (value.source !== undefined && value.source !== 'auto' && value.source !== 'local')
  )
    throw new ExtensionAccessError('denied', 'This query option is unavailable to extensions.')
  const size = (n: unknown) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 && n <= 100
  if (value.limit !== undefined && !size(value.limit))
    throw new ExtensionAccessError('quota', 'Query pages must contain one to one hundred records.')
  if (value.where !== undefined) properties(value.where)
  if (value.orderBy !== undefined) {
    const order = object(value.orderBy)
    if (
      Object.keys(order).length > 4 ||
      Object.values(order).some((direction) => direction !== 'asc' && direction !== 'desc')
    )
      throw new ExtensionAccessError('invalid', 'Invalid query ordering.')
  }
  if (value.page !== undefined) {
    const page = object(value.page)
    keys(page, ['first', 'after', 'count'])
    if (
      !size(page.first) ||
      (value.limit !== undefined && value.limit !== page.first) ||
      (page.after !== undefined &&
        (typeof page.after !== 'string' || !/^[a-f0-9-]{36}$/.test(page.after))) ||
      (page.count !== undefined && page.count !== 'none')
    )
      throw new ExtensionAccessError('invalid', 'Use bounded cursor pages without an exact count.')
  }
}
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
function properties(value: unknown): void {
  const fields = object(value)
  if (Object.keys(fields).length > 16)
    throw new ExtensionAccessError('quota', 'Too many mutation fields.')
  for (const item of Object.values(fields)) {
    if (typeof item === 'string' && item.length > 16_384)
      throw new ExtensionAccessError('quota', 'Request exceeds 16 KiB.')
    if (
      item !== null &&
      typeof item !== 'string' &&
      typeof item !== 'boolean' &&
      !(typeof item === 'number' && Number.isFinite(item))
    )
      throw new ExtensionAccessError('invalid', 'Mutation fields must be finite JSON scalars.')
  }
}
function boundedRequest(value: Record<string, unknown>, maxBytes: number): ExtensionRequest {
  // Only validated, shallow JSON reaches serialization; cycles/deep guest objects cannot recurse here.
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxBytes)
    throw new ExtensionAccessError('quota', 'Request exceeds its byte limit.')
  return value as ExtensionRequest
}
export function decodeExtensionRequest(input: unknown): ExtensionRequest {
  const value = object(input)
  if (value.version !== 1 || !identifier(value.id))
    throw new ExtensionAccessError('invalid', 'Unsupported request version or identifier.')
  if (value.operation === 'data.query') {
    keys(value, ['version', 'id', 'operation', 'schemaId', 'options'])
    if (typeof value.schemaId !== 'string' || !value.schemaId || value.schemaId.length > 512)
      throw new ExtensionAccessError('invalid', 'Invalid query schema.')
    queryOptions(value.options)
    return boundedRequest(value, EXTENSION_OPERATIONS['data.query'].maxBytes)
  }
  if (value.operation === 'data.undo') {
    keys(value, ['version', 'id', 'operation', 'receipt'])
    if (!identifier(value.receipt)) throw new ExtensionAccessError('invalid', 'Invalid receipt.')
    return boundedRequest(value, EXTENSION_OPERATIONS['data.undo'].maxBytes)
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
      if (
        typeof op.schemaId !== 'string' ||
        op.schemaId.length > 512 ||
        (op.id !== undefined && !identifier(op.id))
      )
        throw new ExtensionAccessError('invalid', 'Invalid schema or identifier.')
      properties(op.properties)
    } else if (op.type === 'update') {
      keys(op, ['type', 'nodeId', 'properties'])
      if (!identifier(op.nodeId))
        throw new ExtensionAccessError('invalid', 'Invalid record identifier.')
      properties(op.properties)
    } else if (op.type === 'delete' || op.type === 'restore') {
      keys(op, ['type', 'nodeId'])
      if (!identifier(op.nodeId))
        throw new ExtensionAccessError('invalid', 'Invalid record identifier.')
    } else throw new ExtensionAccessError('unsupported', 'Unsupported mutation.')
  }
  return boundedRequest(value, EXTENSION_OPERATIONS['data.mutate'].maxBytes)
}

/** Coverage is explicit. Unknown imports/exports never fall back to host modules. */
export const EXTENSION_API_COVERAGE = {
  useQuery: 'bounded host pages and scoped live invalidation',
  useMutate: 'private task commands',
  useState: 'worker React',
  useEffect: 'worker React',
  useNode: 'unsupported: requires scoped document handle',
  useXNet: 'denied: raw host context',
  useNodeStore: 'denied: raw storage',
  useDataBridge: 'denied: internal capability',
  documents: 'exact-page text projections, approved IDs and host views',
  documentEditing: 'host-owned plain-paragraph editor with guarded local commits',
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
