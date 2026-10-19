import type { ExtensionGrant } from './extension-data'
import type { ExtensionOperation } from './extension-protocol'
import type { NodeState, TransactionOperation } from '@xnetjs/data'
import type { BridgeTransactionResult, DataBridge } from '@xnetjs/data-bridge'
import { TaskSchema } from '@xnetjs/data'
import { decodeExtensionRequest, ExtensionAccessError } from './extension-protocol'

const editable = new Set(['title', 'status', 'completed', 'priority', 'dueDate'])
export function isPrivateExtensionTask(node: NodeState, owner: string): boolean {
  return (
    node.schemaId === TaskSchema._schemaId &&
    node.createdBy === owner &&
    !node.properties.space &&
    !node.properties.project &&
    !node.properties.page &&
    !node.properties.canvas &&
    !node.properties.folder &&
    !node.properties.parent &&
    (!node.properties.visibility ||
      ['private', 'inherit'].includes(String(node.properties.visibility)))
  )
}
function properties(value: Record<string, unknown>): Record<string, unknown> {
  for (const [key, item] of Object.entries(value)) {
    if (!editable.has(key))
      throw new ExtensionAccessError(
        'denied',
        'Only title, status, completed, priority, and due date can be edited.'
      )
    const valid =
      key === 'title'
        ? typeof item === 'string' && item.trim().length > 0 && item.length <= 500
        : key === 'completed'
          ? typeof item === 'boolean'
          : key === 'dueDate'
            ? item === null || (typeof item === 'number' && Number.isFinite(item))
            : key === 'priority'
              ? ['low', 'medium', 'high', 'urgent'].includes(String(item)) &&
                typeof item === 'string'
              : [
                  'triage',
                  'backlog',
                  'todo',
                  'in-progress',
                  'in-review',
                  'done',
                  'cancelled'
                ].includes(String(item)) && typeof item === 'string'
    if (!valid) throw new ExtensionAccessError('invalid', 'Invalid task property.')
  }
  if (!Object.keys(value).length)
    throw new ExtensionAccessError('invalid', 'No task properties supplied.')
  return value
}
export type ExtensionReceipt = {
  id: string
  before: (NodeState | null)[]
  after: NodeState[]
  heads: Record<string, string>
  fields: string[][]
  undone: boolean
}
export type ExtensionMutationResult = BridgeTransactionResult & { receipt: string }

/** Host-owned session. Guest requests cannot choose a caller, grant, artifact, or epoch. */
export function createExtensionBroker(
  bridge: DataBridge,
  grant: ExtensionGrant,
  current: () => boolean
) {
  let active = true
  let queue: Promise<unknown> = Promise.resolve()
  let accepted = 0
  const created = new Set<string>()
  const receipts = new Map<string, ExtensionReceipt>()
  const replays = new Map<string, { input: string; result: Promise<ExtensionMutationResult> }>()
  const check = () => {
    if (!active || !current())
      throw new ExtensionAccessError('revoked', 'Extension access has stopped.')
    if (!bridge.transaction || !bridge.get)
      throw new ExtensionAccessError(
        'unsupported',
        'Conditional writes are unavailable on this host.'
      )
  }
  const commit = async (
    ops: TransactionOperation[],
    before: (NodeState | null)[],
    ids: string[],
    heads?: Record<string, string>
  ) => {
    check()
    const result = await bridge.transaction!(ops, {
      nodes: ids.map((id, index) => ({ id, expected: before[index], head: heads?.[id] })),
      deadline: Date.now() + 5000
    })
    // This is the linearized accepted command. Revocation drains it before reporting completion.
    const after = result.results.filter((node): node is NodeState => node !== null)
    if (after.length !== ids.length || !result.heads || ids.some((id) => !result.heads?.[id]))
      throw new ExtensionAccessError(
        'conflict',
        'The host returned an incomplete transaction receipt.'
      )
    const receipt = crypto.randomUUID()
    receipts.set(receipt, {
      id: receipt,
      before,
      after,
      heads: result.heads!,
      fields: ops.map((op) => (op.type === 'update' ? Object.keys(op.options.properties) : [])),
      undone: false
    })
    return { ...result, receipt }
  }
  const mutate = async (operations: ExtensionOperation[]): Promise<ExtensionMutationResult> => {
    check()
    if (!grant.taskWrites)
      throw new ExtensionAccessError('denied', 'Editing tasks has not been approved.')
    if (
      grant.records.length + created.size + operations.filter((op) => op.type === 'create').length >
      100
    )
      throw new ExtensionAccessError('quota', 'This extension has reached its 100-record limit.')
    for (const op of operations) {
      if (op.type === 'create') {
        if (op.id !== undefined)
          throw new ExtensionAccessError('denied', 'New task identifiers are assigned by the host.')
        if (!grant.taskWrites.create || op.schemaId !== TaskSchema._schemaId)
          throw new ExtensionAccessError('denied', 'Creating this record is not approved.')
      } else if (!grant.taskWrites.ids.includes(op.nodeId) && !created.has(op.nodeId)) {
        // Reject guessed identifiers before a host read can reveal existence or storage errors.
        throw new ExtensionAccessError('denied', 'Editing is limited to approved personal tasks.')
      }
    }
    const ids = operations.map((op) => (op.type === 'create' ? crypto.randomUUID() : op.nodeId))
    if (new Set(ids).size !== ids.length)
      throw new ExtensionAccessError('invalid', 'A transaction may touch each record once.')
    const before = await Promise.all(ids.map((id) => bridge.get!(id)))
    check()
    const ops: TransactionOperation[] = operations.map((op, index) => {
      const id = ids[index],
        node = before[index]
      if (op.type === 'create') {
        if (!grant.taskWrites?.create || op.schemaId !== TaskSchema._schemaId || node)
          throw new ExtensionAccessError('denied', 'Creating this record is not approved.')
        const props = properties(op.properties)
        if (typeof props.title !== 'string')
          throw new ExtensionAccessError('invalid', 'A task needs a title.')
        return {
          type: 'create',
          options: {
            id,
            schemaId: TaskSchema._schemaId,
            properties: { ...props, visibility: 'private' }
          }
        }
      }
      if (
        (!grant.taskWrites?.ids.includes(id) && !created.has(id)) ||
        !node ||
        !isPrivateExtensionTask(node, grant.owner)
      )
        throw new ExtensionAccessError(
          'denied',
          'Editing is limited to approved personal tasks without a shared container.'
        )
      if (node.deleted && op.type !== 'restore')
        throw new ExtensionAccessError('conflict', 'This task was deleted.')
      if (op.type === 'update')
        return { type: 'update', nodeId: id, options: { properties: properties(op.properties) } }
      if (!grant.taskWrites?.remove)
        throw new ExtensionAccessError(
          'denied',
          'Deleting and restoring tasks has not been approved.'
        )
      return { type: op.type, nodeId: id }
    })
    const result = await commit(ops, before, ids)
    operations.forEach((op, index) => {
      if (op.type === 'create') created.add(ids[index])
    })
    return result
  }
  const undo = async (id: string): Promise<ExtensionMutationResult> => {
    check()
    const receipt = receipts.get(id)
    if (!receipt || receipt.undone)
      throw new ExtensionAccessError('conflict', 'This receipt cannot be undone.')
    const ops: TransactionOperation[] = receipt.after.map((node, index) => {
      const old = receipt.before[index]
      if (!old) return { type: 'delete', nodeId: node.id }
      if (node.deleted !== old.deleted)
        return { type: old.deleted ? 'delete' : 'restore', nodeId: node.id }
      const restored = Object.fromEntries(
        receipt.fields[index].map((key) => [key, old.properties[key] ?? null])
      )
      return { type: 'update', nodeId: node.id, options: { properties: restored } }
    })
    if (
      ops.some((op) => op.type === 'delete' || op.type === 'restore') &&
      !grant.taskWrites?.remove
    )
      throw new ExtensionAccessError(
        'denied',
        'Undoing task creation or deletion requires delete/restore permission.'
      )
    // Snapshots from the receipt are compared at commit: later edits can never be overwritten.
    const result = await commit(
      ops,
      receipt.after,
      receipt.after.map((node) => node.id),
      receipt.heads
    )
    receipt.undone = true
    return result
  }
  return {
    async request(input: unknown): Promise<ExtensionMutationResult> {
      check()
      const request = decodeExtensionRequest(input),
        serialized = JSON.stringify(request)
      const replay = replays.get(request.id)
      if (replay) {
        if (replay.input !== serialized)
          throw new ExtensionAccessError(
            'invalid',
            'A request identifier cannot be reused for different commands.'
          )
        return replay.result
      }
      if (++accepted > 200)
        throw new ExtensionAccessError(
          'quota',
          'This extension session reached its command limit. Reopen it to continue.'
        )
      const result = queue.then(() =>
        request.operation === 'data.mutate' ? mutate(request.operations) : undo(request.receipt)
      )
      queue = result.catch(() => undefined)
      replays.set(request.id, { input: serialized, result })
      return result
    },
    /** Stops admission synchronously; callers await already accepted storage commits before saying revoked. */
    async revoke() {
      active = false
      await queue
    },
    get active() {
      return active && current()
    },
    get receipts() {
      return [...receipts.values()].map(({ id, undone }) => ({ id, undone }))
    },
    createdRecords: () => [...created].map((id) => ({ id, schemaId: TaskSchema._schemaId }))
  }
}
