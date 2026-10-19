import type { NodeState, PropertyBuilder } from '@xnetjs/data'
import type { DataBridge, QueryMetadata, QuerySubscription } from '@xnetjs/data-bridge'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { applyQueryDescriptor, createQueryDescriptor } from '@xnetjs/data-bridge'

export const extensionSchemas = [ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema]
export const EXTENSION_DATA_LIMIT = 200
export interface ExtensionGrant {
  taskWrites?: { ids: string[]; create: boolean; remove: boolean }
  version: 1
  owner: string
  hash: string
  channelIds: string[]
  records: { id: string; schemaId: string }[]
}
export interface ExtensionDataset {
  grant: ExtensionGrant
  nodes: NodeState[]
}
export const grantKey = (owner: string, channelId: string, hash: string) =>
  `xnet:extension-access:v1:${owner}:${channelId}:${hash}`

export function readExtensionGrant(text: string, owner: string, hash: string): ExtensionGrant {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object') throw new Error('Extension access is unreadable.')
  const grant = value as ExtensionGrant
  if (
    Object.keys(grant).some(
      (key) => !['version', 'owner', 'hash', 'channelIds', 'records', 'taskWrites'].includes(key)
    ) ||
    grant.version !== 1 ||
    grant.owner !== owner ||
    grant.hash !== hash ||
    !Array.isArray(grant.channelIds) ||
    grant.channelIds.length > 20 ||
    grant.channelIds.some((id) => typeof id !== 'string' || !id) ||
    !Array.isArray(grant.records) ||
    grant.records.length > 100 ||
    grant.records.some(
      (record) =>
        !record ||
        typeof record.id !== 'string' ||
        !record.id ||
        !([PageSchema._schemaId, TaskSchema._schemaId] as readonly string[]).includes(
          record.schemaId
        )
    )
  )
    throw new Error('Extension access does not match this user, version, or supported data scope.')
  if (
    grant.taskWrites &&
    (!Array.isArray(grant.taskWrites.ids) ||
      grant.taskWrites.ids.some(
        (id) => !grant.records.some((r) => r.id === id && r.schemaId === TaskSchema._schemaId)
      ) ||
      typeof grant.taskWrites.create !== 'boolean' ||
      typeof grant.taskWrites.remove !== 'boolean' ||
      Object.keys(grant.taskWrites).some((key) => !['ids', 'create', 'remove'].includes(key)))
  )
    throw new Error('Invalid task editing grant.')
  return grant
}

const visibleFields: Record<string, readonly string[]> = {
  [TaskSchema._schemaId]: ['title', 'status', 'completed', 'priority', 'dueDate'],
  [PageSchema._schemaId]: ['title', 'icon'],
  [ChannelSchema._schemaId]: ['name', 'description'],
  [ChatMessageSchema._schemaId]: ['channel', 'content', 'author', 'createdAt']
}
export function readableNode(node: NodeState): NodeState {
  return {
    id: node.id,
    schemaId: node.schemaId,
    properties: Object.fromEntries(
      Object.entries(node.properties).filter(([key]) => visibleFields[node.schemaId]?.includes(key))
    ),
    timestamps: {},
    createdAt: node.createdAt,
    createdBy: node.createdBy,
    updatedAt: node.updatedAt,
    updatedBy: node.updatedBy,
    deleted: false
  }
}

/** The host selects data before it crosses the isolation boundary. No store enters the worker. */
export function subscribeExtensionData(
  bridge: DataBridge,
  grant: ExtensionGrant,
  canReadChannel: (id: string) => boolean,
  receive: (result: { data: ExtensionDataset | null; error: Error | null }) => void
): () => void {
  let stopped = false
  const subscriptions: {
    subscription: QuerySubscription
    accepts: (node: NodeState) => boolean
  }[] = []
  const cleanups: (() => void)[] = []
  const stop = () => {
    stopped = true
    cleanups.forEach((cleanup) => cleanup())
  }
  const emit = () => {
    if (stopped) return
    try {
      if (grant.channelIds.some((id) => !canReadChannel(id)))
        throw new Error('Access to a selected conversation was revoked.')
      const nodes = new Map<string, NodeState>()
      for (const { subscription, accepts } of subscriptions) {
        const metadata = subscription.getMetadata?.()
        if (metadata?.error) throw new Error(metadata.error)
        const result = subscription.getSnapshot()
        if (result === null) {
          receive({ data: null, error: null })
          return
        }
        if (result.length > EXTENSION_DATA_LIMIT || metadata?.pageInfo.hasMore)
          throw new Error(
            'This preview supports up to 200 records per selection. Choose a smaller data set.'
          )
        for (const node of result) {
          if (!accepts(node))
            throw new Error('The store returned data outside the extension grant.')
          if (node.deleted || node.properties.redacted === true) continue
          if (
            grant.records.some((record) => record.id === node.id) &&
            node.createdBy !== grant.owner
          )
            throw new Error('Access to a selected personal record is no longer available.')
          nodes.set(node.id, readableNode(node))
        }
      }
      const dataset = { grant, nodes: [...nodes.values()] }
      if (
        dataset.nodes.length > 500 ||
        new TextEncoder().encode(JSON.stringify(dataset)).length > 256_000
      )
        throw new Error('The selected data exceeds the preview limit. Choose fewer records.')
      receive({ data: dataset, error: null })
    } catch (cause) {
      stop()
      receive({ data: null, error: cause instanceof Error ? cause : new Error(String(cause)) })
    }
  }
  try {
    if (grant.channelIds.some((id) => !canReadChannel(id)))
      throw new Error('A selected conversation is unavailable.')
    for (const id of grant.channelIds) {
      subscriptions.push(
        {
          subscription: bridge.query(ChannelSchema, { nodeId: id }),
          accepts: (node) => node.id === id && node.schemaId === ChannelSchema._schemaId
        },
        {
          subscription: bridge.query(ChatMessageSchema, {
            where: { channel: id },
            limit: EXTENSION_DATA_LIMIT + 1
          }),
          accepts: (node) =>
            node.schemaId === ChatMessageSchema._schemaId && node.properties.channel === id
        }
      )
    }
    for (const record of grant.records) {
      const schema = extensionSchemas.find((schema) => schema._schemaId === record.schemaId)
      if (
        !schema ||
        !([PageSchema._schemaId, TaskSchema._schemaId] as readonly string[]).includes(
          record.schemaId
        )
      )
        throw new Error('This record type is not available to extensions.')
      subscriptions.push({
        subscription: bridge.query<Record<string, PropertyBuilder>>(schema, { nodeId: record.id }),
        accepts: (node) => node.id === record.id && node.schemaId === record.schemaId
      })
    }
    for (const { subscription } of subscriptions) {
      if (stopped) break
      const cleanup = subscription.subscribe(emit)
      if (stopped) cleanup()
      else cleanups.push(cleanup)
    }
    emit()
  } catch (cause) {
    stop()
    receive({ data: null, error: cause instanceof Error ? cause : new Error(String(cause)) })
  }
  return stop
}

/** Real useQuery runs against this read-only bridge inside the isolated render worker. */
export function createExtensionDataBridge(dataset: ExtensionDataset): DataBridge {
  const { grant } = dataset
  const allowedSchemas = new Set([
    ...(grant.channelIds.length ? [ChannelSchema._schemaId, ChatMessageSchema._schemaId] : []),
    ...(grant.taskWrites?.create ? [TaskSchema._schemaId] : []),
    ...grant.records.map((record) => record.schemaId)
  ])
  const allowed = (node: NodeState) =>
    !node.deleted &&
    node.properties.redacted !== true &&
    ((node.schemaId === ChannelSchema._schemaId && grant.channelIds.includes(node.id)) ||
      (node.schemaId === ChatMessageSchema._schemaId &&
        grant.channelIds.includes(String(node.properties.channel))) ||
      grant.records.some((record) => record.id === node.id && record.schemaId === node.schemaId))
  if (dataset.nodes.some((node) => !allowed(node)))
    throw new Error('Extension data is outside the approved scope.')
  const nodes = structuredClone(dataset.nodes)
  const deny = () => {
    throw new Error('Extension access denied: this version has read-only access to selected data.')
  }
  const denyQuery = () => {
    throw new Error('Extension access denied: this query is outside the approved data scope.')
  }
  return {
    query(schema, options = {}) {
      if (
        !allowedSchemas.has(schema._schemaId) ||
        options.includeDeleted ||
        (options.source && options.source !== 'local' && options.source !== 'auto') ||
        (options.mode && options.mode !== 'local')
      )
        return denyQuery()
      if (
        options.nodeId &&
        !nodes.some((node) => node.id === options.nodeId && node.schemaId === schema._schemaId) &&
        !grant.records.some(
          (record) => record.id === options.nodeId && record.schemaId === schema._schemaId
        ) &&
        !(schema._schemaId === ChannelSchema._schemaId && grant.channelIds.includes(options.nodeId))
      )
        return denyQuery()
      const channel = (options.where as Record<string, unknown> | undefined)?.channel
      if (
        schema._schemaId === ChatMessageSchema._schemaId &&
        channel !== undefined &&
        !grant.channelIds.includes(String(channel))
      )
        return denyQuery()
      const fields = visibleFields[schema._schemaId] ?? []
      if (
        Object.keys(options).some(
          (key) =>
            ![
              'nodeId',
              'where',
              'orderBy',
              'limit',
              'offset',
              'includeDeleted',
              'source',
              'mode'
            ].includes(key)
        ) ||
        Object.keys(options.where ?? {}).some((key) => !fields.includes(key)) ||
        Object.keys(options.orderBy ?? {}).some(
          (key) => !fields.includes(key) && !['createdAt', 'updatedAt'].includes(key)
        ) ||
        [options.limit, options.offset].some(
          (value) =>
            value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 500)
        )
      )
        throw new Error('Extension query uses an unavailable field or option.')
      const descriptor = createQueryDescriptor(schema._schemaId, options)
      const data = applyQueryDescriptor(nodes, descriptor)
      const total = applyQueryDescriptor(nodes, {
        ...descriptor,
        limit: undefined,
        offset: undefined
      }).length
      const hasMore = total > (options.offset ?? 0) + data.length
      const metadata: QueryMetadata = {
        source: 'memory',
        updatedAt: Date.now(),
        pageInfo: {
          totalCount: total,
          countMode: 'exact',
          hasMore,
          hasNextPage: hasMore,
          hasPreviousPage: (options.offset ?? 0) > 0,
          loadedCount: data.length
        },
        completeness: {
          level: hasMore ? 'partial' : 'complete',
          ...(hasMore ? { reason: 'page-limited' as const } : {})
        }
      }
      return { getSnapshot: () => data, getMetadata: () => metadata, subscribe: () => () => {} }
    },
    create: deny,
    update: deny,
    delete: deny,
    restore: deny,
    bulkWrite: deny,
    transaction: deny,
    acquireDoc: deny,
    get: deny,
    list: deny,
    status: 'disconnected',
    on: () => () => {},
    destroy: () => {}
  }
}
