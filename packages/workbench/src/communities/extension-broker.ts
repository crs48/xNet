import type { ExtensionAuthority } from './extension-authority'
import type { ExtensionGrant } from './extension-data'
import type { ExtensionOperation } from './extension-protocol'
import type { NodeState, TransactionOperation } from '@xnetjs/data'
import type { BridgeTransactionResult, DataBridge } from '@xnetjs/data-bridge'
import { TaskSchema } from '@xnetjs/data'
import { privateExtensionDestination } from './extension-containers'
import {
  decodeExtensionRequest,
  ExtensionAccessError,
  EXTENSION_OPERATIONS
} from './extension-protocol'

const editable = new Set(['title', 'status', 'completed', 'priority', 'dueDate'])
export function isPrivateExtensionTask(node: NodeState, owner: string): boolean {
  return (
    node.schemaId === TaskSchema._schemaId &&
    node.createdBy === owner &&
    !node.properties.space &&
    !node.properties.project &&
    !node.properties.page &&
    !node.properties.canvas &&
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
  current: () => boolean,
  authority: ExtensionAuthority,
  initialCreated: readonly string[] = []
) {
  let active = true
  let queue: Promise<unknown> = Promise.resolve()
  let accepted = 0
  const created = new Set<string>(initialCreated)
  const receipts = new Map<string, ExtensionReceipt>()
  const replays = new Map<string, { input: string; result: Promise<ExtensionMutationResult> }>()
  const check = () => {
    if (!active || !current())
      throw new ExtensionAccessError('revoked', 'Extension access has stopped.')
    if (!bridge.transaction || !bridge.get || !bridge.getLocalState)
      throw new ExtensionAccessError(
        'unsupported',
        'Conditional writes are unavailable on this host.'
      )
  }
  let execution: { signal?: AbortSignal; deadline: number } | null = null
  const checkExecution = () => {
    check()
    if (execution?.signal?.aborted)
      throw new ExtensionAccessError(
        'cancelled',
        'The request was cancelled. Already committed edits are not rolled back.'
      )
    if (execution && Date.now() >= execution.deadline)
      throw new ExtensionAccessError('timeout', 'The operation exceeded its deadline.')
  }
  const commit = async (
    ops: TransactionOperation[],
    before: (NodeState | null)[],
    ids: string[],
    heads: Record<string, string> | undefined,
    requestId: string,
    requestInput: string,
    newIds: string[] = [],
    undoId?: string
  ) => {
    checkExecution()
    const state = await authority.read()
    if (JSON.stringify(state.approval.grant) !== JSON.stringify(grant))
      throw new ExtensionAccessError('revoked', 'The permission scope changed.')
    if (state.approval.commands >= 1000)
      throw new ExtensionAccessError(
        'quota',
        'This approval reached its 1,000-command limit. Review permissions to continue.'
      )
    if (grant.records.length + state.approval.created.length + newIds.length > 100)
      throw new ExtensionAccessError('quota', 'This extension has reached its 100-record limit.')
    checkExecution()
    const dependencyGuards = new Map<string, NodeState | null>()
    let deadline = execution!.deadline
    for (const node of before)
      if (node) {
        const scope = await privateExtensionDestination(
          bridge,
          grant,
          node,
          execution?.signal ?? new AbortController().signal
        )
        for (const [id, expected] of scope.guards) dependencyGuards.set(id, expected)
        deadline = Math.min(deadline, scope.deadline())
      }
    checkExecution()
    const fields = ops.map((op) => (op.type === 'update' ? Object.keys(op.options.properties) : []))
    const context = JSON.stringify({
      input: requestInput,
      before,
      fields,
      epoch: authority.epoch,
      owner: grant.owner,
      artifact: grant.hash,
      installation: authority.key
    })
    const receipt = requestId
    const result = await bridge.transaction!(ops, {
      nodes: [
        ...ids.map((id, index) => ({ id, expected: before[index], head: heads?.[id] })),
        ...[...dependencyGuards]
          .filter(([id]) => !ids.includes(id))
          .map(([id, expected]) => ({ id, expected }))
      ],
      deadline,
      localState: [
        {
          key: authority.key,
          expected: state.raw,
          value: JSON.stringify({
            ...state.approval,
            created: [...state.approval.created, ...newIds],
            commands: state.approval.commands + 1,
            lastReceipt: undoId
              ? state.approval.lastReceipt === undoId
                ? null
                : state.approval.lastReceipt
              : requestId
          })
        },
        ...(undoId
          ? [
              {
                key: `${authority.key}:${authority.epoch}:undo:${undoId}`,
                expected: null,
                value: requestId
              }
            ]
          : [])
      ],
      receipt: { key: receiptKey(requestId), context }
    })
    // This is the linearized accepted command. Revocation drains it before reporting completion.
    const after = result.results.filter((node): node is NodeState => node !== null)
    if (after.length !== ids.length || !result.heads || ids.some((id) => !result.heads?.[id]))
      throw new ExtensionAccessError(
        'conflict',
        'The host returned an incomplete transaction receipt.'
      )
    receipts.set(receipt, {
      id: receipt,
      before,
      after,
      heads: result.heads!,
      fields,
      undone: false
    })
    await authority.read()
    checkExecution()
    return { ...result, receipt }
  }
  const mutate = async (
    operations: ExtensionOperation[],
    requestId: string,
    input: string
  ): Promise<ExtensionMutationResult> => {
    checkExecution()
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
    checkExecution()
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
    const result = await commit(
      ops,
      before,
      ids,
      undefined,
      requestId,
      input,
      operations.flatMap((op, index) => (op.type === 'create' ? [ids[index]] : []))
    )
    operations.forEach((op, index) => {
      if (op.type === 'create') created.add(ids[index])
    })
    return result
  }
  const undo = async (
    id: string,
    requestId: string,
    input: string
  ): Promise<ExtensionMutationResult> => {
    checkExecution()
    await recover(id)
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
      receipt.heads,
      requestId,
      input,
      [],
      id
    )
    receipt.undone = true
    return result
  }
  const receiptKey = (id: string) => `${authority.key}:${authority.epoch}:request:${id}`
  const recover = async (id: string, input?: string): Promise<ExtensionMutationResult | null> => {
    const raw = await bridge.getLocalState!(receiptKey(id))
    if (raw === null) return null
    const result = JSON.parse(raw) as {
      version: number
      context: string
      batchId: string
      results: NodeState[]
      heads: Record<string, string>
    }
    const context = JSON.parse(result.context) as {
      input: string
      before: (NodeState | null)[]
      fields: string[][]
      epoch: string
      owner: string
      artifact: string
      installation: string
    }
    if (
      result.version !== 1 ||
      context.epoch !== authority.epoch ||
      context.owner !== grant.owner ||
      context.artifact !== grant.hash ||
      context.installation !== authority.key ||
      !Array.isArray(result.results) ||
      !Array.isArray(context.before) ||
      !Array.isArray(context.fields)
    )
      throw new ExtensionAccessError('invalid', 'The durable action receipt is unreadable.')
    if (input !== undefined && context.input !== input)
      throw new ExtensionAccessError(
        'invalid',
        'A request identifier cannot be reused for different commands.'
      )
    const undone =
      (await bridge.getLocalState!(`${authority.key}:${authority.epoch}:undo:${id}`)) !== null
    receipts.set(id, {
      id,
      before: context.before,
      after: result.results,
      fields: context.fields,
      heads: result.heads,
      undone
    })
    await authority.read()
    checkExecution()
    return {
      batchId: result.batchId,
      results: result.results,
      heads: result.heads,
      tempIds: {},
      receipt: id
    }
  }
  return {
    async undoNeedsRemoval(id: string): Promise<boolean> {
      check()
      await authority.read()
      await recover(id)
      const receipt = receipts.get(id)
      return (
        !!receipt &&
        !receipt.undone &&
        receipt.after.some(
          (node, index) => !receipt.before[index] || node.deleted !== receipt.before[index]!.deleted
        )
      )
    },
    async request(input: unknown, signal?: AbortSignal): Promise<ExtensionMutationResult> {
      check()
      if (signal?.aborted) throw new ExtensionAccessError('cancelled', 'The request was cancelled.')
      const request = decodeExtensionRequest(input)
      if (request.operation === 'data.query')
        throw new ExtensionAccessError('unsupported', 'Queries require the read broker.')
      const serialized = JSON.stringify(request)
      const replay = replays.get(request.id)
      if (replay) {
        if (replay.input !== serialized)
          throw new ExtensionAccessError(
            'invalid',
            'A request identifier cannot be reused for different commands.'
          )
        await authority.read()
        check()
        const result = await replay.result
        await authority.read()
        check()
        if (signal?.aborted)
          throw new ExtensionAccessError('cancelled', 'The request was cancelled.')
        return result
      }
      if (++accepted > 200)
        throw new ExtensionAccessError(
          'quota',
          'This extension session reached its command limit. Reopen it to continue.'
        )
      const deadline = Date.now() + EXTENSION_OPERATIONS[request.operation].deadlineMs
      const result = queue.then(async () => {
        execution = { signal, deadline }
        try {
          checkExecution()
          const state = await authority.read()
          state.approval.created.forEach((id) => created.add(id))
          check()
          const saved = await recover(request.id, serialized)
          if (saved) return saved
          try {
            return await (request.operation === 'data.mutate'
              ? mutate(request.operations, request.id, serialized)
              : undo(request.receipt, request.id, serialized))
          } catch (cause) {
            // A response can be lost after commit. Recover only this exact command, never issue it twice.
            const committed = await recover(request.id, serialized)
            if (committed) return committed
            throw cause
          }
        } finally {
          execution = null
        }
      })
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
