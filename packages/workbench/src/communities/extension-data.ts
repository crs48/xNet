import type { ExtensionDocumentProjection } from './extension-documents'
import type { NodeState } from '@xnetjs/data'
import type { DataBridge, QueryMetadata } from '@xnetjs/data-bridge'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { applyQueryDescriptor, createQueryDescriptor } from '@xnetjs/data-bridge'

export const extensionSchemas = [ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema]
export interface ExtensionGrant {
  documents?: { read: string[] }
  taskWrites?: { ids: string[]; create: boolean; remove: boolean }
  version: 1
  owner: string
  hash: string
  channelIds: string[]
  records: { id: string; schemaId: string }[]
}
export interface ExtensionDataset {
  hostQueries?: boolean
  grant: ExtensionGrant
  nodes: NodeState[]
  documents?: ExtensionDocumentProjection[]
}
export const grantKey = (owner: string, channelId: string, hash: string) =>
  `xnet:extension-access:v1:${owner}:${channelId}:${hash}`

export function readExtensionGrant(text: string, owner: string, hash: string): ExtensionGrant {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object') throw new Error('Extension access is unreadable.')
  const grant = value as ExtensionGrant
  if (
    Object.keys(grant).some(
      (key) =>
        !['version', 'owner', 'hash', 'channelIds', 'records', 'taskWrites', 'documents'].includes(
          key
        )
    ) ||
    grant.version !== 1 ||
    grant.owner !== owner ||
    grant.hash !== hash ||
    !Array.isArray(grant.channelIds) ||
    grant.channelIds.length > 20 ||
    new Set(grant.channelIds).size !== grant.channelIds.length ||
    grant.channelIds.some((id) => typeof id !== 'string' || !id) ||
    !Array.isArray(grant.records) ||
    grant.records.length > 100 ||
    grant.records.some(
      (record) =>
        !record ||
        typeof record !== 'object' ||
        Object.keys(record).some((key) => !['id', 'schemaId'].includes(key)) ||
        typeof record.id !== 'string' ||
        !record.id ||
        !([PageSchema._schemaId, TaskSchema._schemaId] as readonly string[]).includes(
          record.schemaId
        )
    )
  )
    throw new Error('Extension access does not match this user, version, or supported data scope.')
  if (new Set(grant.records.map((record) => record.id)).size !== grant.records.length)
    throw new Error('Selected records must be unique.')
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
  if (
    grant.documents &&
    (Object.keys(grant.documents).some((key) => key !== 'read') ||
      !Array.isArray(grant.documents.read) ||
      grant.documents.read.length > 10 ||
      new Set(grant.documents.read).size !== grant.documents.read.length ||
      grant.documents.read.some(
        (id) =>
          !grant.records.some(
            (record) => record.id === id && record.schemaId === PageSchema._schemaId
          )
      ))
  )
    throw new Error('Document access must name at most ten selected pages.')
  return grant
}

export const visibleExtensionFields: Record<string, readonly string[]> = {
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
      Object.entries(node.properties).filter(([key]) =>
        visibleExtensionFields[node.schemaId]?.includes(key)
      )
    ),
    timestamps: {},
    createdAt: node.createdAt,
    createdBy: node.createdBy,
    updatedAt: node.updatedAt,
    updatedBy: node.updatedBy,
    deleted: false
  }
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
      const fields = visibleExtensionFields[schema._schemaId] ?? []
      if (
        Object.keys(options).some(
          (key) =>
            ![
              'nodeId',
              'where',
              'orderBy',
              'limit',
              'offset',
              'page',
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
      if (
        options.page &&
        (options.page.after ||
          !Number.isSafeInteger(options.page.first) ||
          options.page.first < 1 ||
          options.page.first > 100)
      )
        throw new Error('Cursor pages require the live host query broker.')
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
