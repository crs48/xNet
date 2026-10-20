import type { ExtensionAuthority } from './extension-authority'
import type { ExtensionGrant } from './extension-data'
import type { ExtensionQueryRequest } from './extension-protocol'
import type { DefinedSchema, NodeState, PropertyBuilder } from '@xnetjs/data'
import type { DataBridge, QueryMetadata, QueryOptions } from '@xnetjs/data-bridge'
import { ChannelSchema, ChatMessageSchema, TaskSchema } from '@xnetjs/data'
import { applyQueryDescriptor, createQueryDescriptor, encodeQueryCursor } from '@xnetjs/data-bridge'
import { extensionSchemas, readableNode, visibleExtensionFields } from './extension-data'
import { ExtensionAccessError } from './extension-protocol'

export interface ExtensionQueryResult {
  nodes: NodeState[]
  metadata: QueryMetadata
}

/** A bounded host subscription is acquired only for the requested page, then released. */
function readPage(
  bridge: DataBridge,
  schema: DefinedSchema<Record<string, PropertyBuilder>>,
  options: QueryOptions,
  signal: AbortSignal
): Promise<NodeState[]> {
  if (signal.aborted) throw new ExtensionAccessError('cancelled', 'The query was cancelled.')
  return new Promise((resolve, reject) => {
    let done = false
    let cleanup = () => {}
    const finish = (nodes: NodeState[] | null, error?: unknown) => {
      if (done || (!error && nodes === null)) return
      done = true
      cleanup()
      signal.removeEventListener('abort', cancel)
      if (error) reject(error)
      else resolve(nodes!)
    }
    const cancel = () =>
      finish(null, new ExtensionAccessError('cancelled', 'The query was cancelled.'))
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const subscription = bridge.query(schema, options)
      let ready = !bridge.reloadQuery
      const changed = () => {
        if (!ready) return
        const metadata = subscription.getMetadata?.()
        if (metadata?.error)
          finish(
            null,
            new ExtensionAccessError('unavailable', 'The selected data could not be read.')
          )
        else finish(subscription.getSnapshot())
      }
      cleanup = subscription.subscribe(changed)
      if (done) cleanup()
      else if (bridge.reloadQuery) {
        void bridge.reloadQuery(createQueryDescriptor(schema._schemaId, options)).then(
          () => {
            ready = true
            changed()
          },
          (error) => finish(null, error)
        )
      } else changed()
    } catch (error) {
      finish(null, error)
    }
  })
}

/** Cursors and policy state stay in this installation's host closure; raw storage cursors never cross. */
export function createExtensionQueryBroker(
  bridge: DataBridge,
  grant: ExtensionGrant,
  authority: ExtensionAuthority,
  canReadChannel: (id: string) => boolean
) {
  const cursors = new Map<string, { raw: string; shape: string; expires: number }>()
  const check = async (signal: AbortSignal) => {
    if (signal.aborted) throw new ExtensionAccessError('cancelled', 'The query was cancelled.')
    const state = await authority.read()
    if (grant.channelIds.some((id) => !canReadChannel(id)))
      throw new ExtensionAccessError('revoked', 'Conversation access is no longer available.')
    if (JSON.stringify(state.approval.grant) !== JSON.stringify(grant))
      throw new ExtensionAccessError('revoked', 'The permission scope changed.')
    return state.approval
  }
  return {
    async query(
      request: ExtensionQueryRequest,
      signal: AbortSignal
    ): Promise<ExtensionQueryResult> {
      const approval = await check(signal)
      const schema = extensionSchemas.find((item) => item._schemaId === request.schemaId)
      if (!schema || !bridge.get)
        throw new ExtensionAccessError('unsupported', 'This query is unavailable.')
      const options = request.options
      const fields = visibleExtensionFields[request.schemaId] ?? []
      if (
        Object.keys(options.where ?? {}).some((key) => !fields.includes(key)) ||
        Object.keys(options.orderBy ?? {}).some(
          (key) => !fields.includes(key) && !['createdAt', 'updatedAt'].includes(key)
        )
      )
        throw new ExtensionAccessError('denied', 'The query uses a field outside its read grant.')
      const records = [
        ...grant.records,
        ...approval.created.map((id) => ({ id, schemaId: TaskSchema._schemaId }))
      ]
      const selected = records.filter((record) => record.schemaId === request.schemaId)
      const isMessages = schema._schemaId === ChatMessageSchema._schemaId
      const isChannels = schema._schemaId === ChannelSchema._schemaId
      const channels =
        options.where?.channel === undefined
          ? grant.channelIds
          : grant.channelIds.filter((id) => id === options.where?.channel)
      if (isMessages && options.where?.channel !== undefined && !channels.length)
        throw new ExtensionAccessError('denied', 'The conversation is outside the read grant.')
      if (
        isMessages || isChannels
          ? !grant.channelIds.length
          : !selected.length &&
            !(schema._schemaId === TaskSchema._schemaId && grant.taskWrites?.create)
      )
        throw new ExtensionAccessError('denied', 'This schema is outside the read grant.')
      const selectedIds = isChannels ? grant.channelIds : selected.map((record) => record.id)
      if (options.nodeId && !isMessages && !selectedIds.includes(options.nodeId))
        throw new ExtensionAccessError('denied', 'This record is outside the read grant.')
      // Guessed message IDs must still be constrained by a channel predicate in storage.
      const size = options.page?.first ?? options.limit ?? 50
      const orderBy = options.orderBy ?? { createdAt: 'desc' as const }
      const shape = JSON.stringify(
        createQueryDescriptor(schema._schemaId, {
          nodeId: options.nodeId,
          where: options.where,
          orderBy
        })
      )
      let after: string | undefined
      if (options.page?.after) {
        const cursor = cursors.get(options.page.after)
        if (!cursor || cursor.shape !== shape || cursor.expires <= Date.now())
          throw new ExtensionAccessError(
            'invalid',
            'This cursor is expired or belongs to another query or approval.'
          )
        after = cursor.raw
      }
      const descriptor = createQueryDescriptor(schema._schemaId, {
        ...options,
        limit: size + 1,
        orderBy,
        page: { first: size + 1, after, count: 'none' }
      })
      let candidates: NodeState[]
      if (isMessages) {
        const pages = await Promise.all(
          channels.map(async (channel) => {
            const visible: NodeState[] = []
            let cursor = after
            for (let scanned = 0; scanned < 1000; scanned += size + 1) {
              const rows = await readPage(
                bridge,
                schema,
                {
                  ...options,
                  where: { ...options.where, channel },
                  orderBy,
                  limit: size + 1,
                  page: { first: size + 1, after: cursor, count: 'none' },
                  source: 'local',
                  mode: 'local'
                },
                signal
              )
              if (
                rows.length > size + 1 ||
                rows.some(
                  (node) =>
                    node.schemaId !== schema._schemaId ||
                    node.properties.channel !== channel ||
                    (options.nodeId && node.id !== options.nodeId)
                )
              )
                throw new ExtensionAccessError(
                  'denied',
                  'The store returned data outside the query scope.'
                )
              visible.push(
                ...rows.filter((node) => !node.deleted && node.properties.redacted !== true)
              )
              if (visible.length > size || rows.length < size + 1) return visible
              cursor = encodeQueryCursor(descriptor, rows[rows.length - 1])
            }
            throw new ExtensionAccessError(
              'quota',
              'This query exceeded its scan budget. Narrow its filters.'
            )
          })
        )
        candidates = pages.flat()
      } else {
        const ids = options.nodeId ? [options.nodeId] : selectedIds
        const rows = await Promise.all(ids.map((id) => bridge.get!(id)))
        if (
          rows.some(
            (node, index) =>
              node &&
              (node.id !== ids[index] ||
                node.schemaId !== schema._schemaId ||
                (!isChannels && node.createdBy !== grant.owner))
          )
        )
          throw new ExtensionAccessError('denied', 'A selected record is no longer available.')
        candidates = rows.filter(
          (node): node is NodeState => !!node && !node.deleted && node.properties.redacted !== true
        )
      }
      const ordered = applyQueryDescriptor(candidates, descriptor)
      // Query caches may revalidate asynchronously. Recheck the bounded visible window
      // against current records before disclosing old content or a reparented message.
      if (isMessages) {
        const current = await Promise.all(ordered.map((node) => bridge.get!(node.id)))
        if (
          ordered.some((node, index) => {
            const latest = current[index]
            return (
              !latest ||
              latest.deleted ||
              latest.properties.redacted === true ||
              JSON.stringify(readableNode(latest)) !== JSON.stringify(readableNode(node))
            )
          })
        )
          throw new ExtensionAccessError(
            'conflict',
            'The conversation changed while loading this page. Reload it.'
          )
      }
      const hasMore = ordered.length > size
      const nodes = ordered.slice(0, size).map(readableNode)
      let endCursor: string | undefined
      if (hasMore && nodes.length) {
        endCursor = crypto.randomUUID()
        for (const [key, cursor] of cursors) if (cursor.expires <= Date.now()) cursors.delete(key)
        if (cursors.size >= 1000) cursors.delete(cursors.keys().next().value!)
        cursors.set(endCursor, {
          raw: encodeQueryCursor(descriptor, nodes[nodes.length - 1]),
          shape,
          expires: Date.now() + 600_000
        })
      }
      const result: ExtensionQueryResult = {
        nodes,
        metadata: {
          source: 'local',
          updatedAt: Date.now(),
          pageInfo: {
            totalCount: null,
            countMode: 'none',
            hasMore,
            hasNextPage: hasMore,
            hasPreviousPage: !!after,
            loadedCount: nodes.length,
            ...(endCursor ? { endCursor } : {})
          },
          completeness: {
            level: hasMore || after ? 'partial' : 'complete',
            ...(hasMore || after ? { reason: 'page-limited' as const } : {})
          }
        }
      }
      if (new TextEncoder().encode(JSON.stringify(result)).length > 256_000)
        throw new ExtensionAccessError(
          'quota',
          'The query page exceeds 256 KiB. Request fewer records.'
        )
      await check(signal)
      return result
    }
  }
}
