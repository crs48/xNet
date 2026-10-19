import type { NodeState, PropertyBuilder } from '@xnetjs/data'
import type { DataBridge, QuerySubscription } from '@xnetjs/data-bridge'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { applyQueryDescriptor, createQueryDescriptor } from '@xnetjs/data-bridge'

export const extensionSchemas = [ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema]
export const EXTENSION_DATA_LIMIT = 200
export interface ExtensionGrant {
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
  return grant
}

function readableNode(node: NodeState): NodeState {
  return {
    id: node.id,
    schemaId: node.schemaId,
    properties: node.properties,
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
      if (dataset.nodes.length > 500 || JSON.stringify(dataset).length > 256_000)
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
  return {
    query(schema, options = {}) {
      if (
        !allowedSchemas.has(schema._schemaId) ||
        options.includeDeleted ||
        (options.source && options.source !== 'local' && options.source !== 'auto') ||
        (options.mode && options.mode !== 'local')
      )
        return deny()
      if (
        options.nodeId &&
        !nodes.some((node) => node.id === options.nodeId && node.schemaId === schema._schemaId) &&
        !grant.records.some(
          (record) => record.id === options.nodeId && record.schemaId === schema._schemaId
        ) &&
        !(schema._schemaId === ChannelSchema._schemaId && grant.channelIds.includes(options.nodeId))
      )
        return deny()
      const channel = (options.where as Record<string, unknown> | undefined)?.channel
      if (
        schema._schemaId === ChatMessageSchema._schemaId &&
        channel !== undefined &&
        !grant.channelIds.includes(String(channel))
      )
        return deny()
      const descriptor = createQueryDescriptor(schema._schemaId, options)
      const data = applyQueryDescriptor(nodes, descriptor)
      return { getSnapshot: () => data, subscribe: () => () => {} }
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
