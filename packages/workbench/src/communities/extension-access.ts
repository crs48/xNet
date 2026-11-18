import type { ExtensionAccessIntent } from './extension-access-intent'
import type { ExtensionGrant } from './extension-data'
import type { ExtensionRequest } from './extension-protocol'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'

export type ExtensionSelection = Pick<
  ExtensionGrant,
  'channelIds' | 'records' | 'taskWrites' | 'documents' | 'containers'
>

export function suggestedExtensionAccess(
  intent: ExtensionAccessIntent,
  channelId: string,
  selected?: ExtensionSelection
): ExtensionSelection {
  const records = (selected?.records ?? []).filter(
    (record) =>
      (intent.tasks && record.schemaId === TaskSchema._schemaId) ||
      (intent.pages && record.schemaId === PageSchema._schemaId)
  )
  const pages = records
    .filter((record) => record.schemaId === PageSchema._schemaId)
    .map((record) => record.id)
  return {
    channelIds: intent.conversations ? (selected ? selected.channelIds : [channelId]) : [],
    records,
    containers: selected?.containers,
    ...(intent.createTasks || intent.editTasks || intent.removeTasks
      ? {
          taskWrites: {
            ids: records
              .filter((record) => record.schemaId === TaskSchema._schemaId)
              .map((record) => record.id),
            create: intent.createTasks,
            remove: intent.removeTasks
          }
        }
      : {}),
    ...(intent.readDocuments
      ? { documents: { read: pages, ...(intent.editDocuments ? { write: pages } : {}) } }
      : {})
  }
}

export function needsDataSelection(
  intent: ExtensionAccessIntent,
  scope: ExtensionSelection
): boolean {
  return (
    (intent.conversations && !scope.channelIds.length) ||
    (intent.tasks &&
      !intent.createTasks &&
      !scope.records.some((record) => record.schemaId === TaskSchema._schemaId) &&
      !scope.containers?.length) ||
    (intent.pages &&
      (intent.readDocuments
        ? !scope.documents?.read.length
        : !scope.records.some((record) => record.schemaId === PageSchema._schemaId) &&
          !scope.containers?.length))
  )
}

/** Escalate only recognized operations and already-disclosed records. Never turn guessed IDs into a data picker. */
export function requestedExtensionAccess(
  request: ExtensionRequest,
  grant: ExtensionGrant,
  created: readonly string[],
  channelId: string
): ExtensionSelection | null {
  if (request.operation === 'data.undo') return null
  if (request.operation === 'data.query') {
    if (
      !request.options.nodeId &&
      (request.schemaId === TaskSchema._schemaId || request.schemaId === PageSchema._schemaId) &&
      !grant.records.some((record) => record.schemaId === request.schemaId) &&
      !grant.containers?.length &&
      !(request.schemaId === TaskSchema._schemaId && (grant.taskWrites?.create || created.length))
    )
      return { ...grant }
    if (
      [ChannelSchema._schemaId, ChatMessageSchema._schemaId].includes(
        request.schemaId as typeof ChannelSchema._schemaId
      ) &&
      !grant.channelIds.includes(channelId) &&
      (!request.options.where?.channel || request.options.where.channel === channelId) &&
      (!request.options.nodeId ||
        (request.schemaId === ChannelSchema._schemaId && request.options.nodeId === channelId))
    )
      return { ...grant, channelIds: [...grant.channelIds, channelId] }
    return null
  }
  const writes = grant.taskWrites ?? { ids: [], create: false, remove: false }
  let create = writes.create,
    remove = writes.remove
  const ids = new Set(writes.ids)
  for (const op of request.operations) {
    if (op.type === 'create') {
      if (op.schemaId !== TaskSchema._schemaId || op.id !== undefined) return null
      create = true
    } else {
      if (
        !created.includes(op.nodeId) &&
        !grant.records.some(
          (record) => record.id === op.nodeId && record.schemaId === TaskSchema._schemaId
        )
      )
        return null
      if (!created.includes(op.nodeId)) ids.add(op.nodeId)
      if (op.type === 'delete' || op.type === 'restore') remove = true
    }
  }
  const next = { ids: [...ids], create, remove }
  if (grant.taskWrites && JSON.stringify(next) === JSON.stringify(grant.taskWrites)) return null
  return { ...grant, taskWrites: next }
}

export function mergeExtensionAccess(
  previous: ExtensionSelection,
  next: ExtensionSelection
): ExtensionSelection {
  return {
    channelIds: [...new Set([...previous.channelIds, ...next.channelIds])],
    records: [
      ...new Map(
        [...previous.records, ...next.records].map((record) => [record.id, record])
      ).values()
    ],
    containers: [
      ...new Map(
        [...(previous.containers ?? []), ...(next.containers ?? [])].map((container) => [
          `${container.kind}:${container.id}`,
          container
        ])
      ).values()
    ],
    ...(previous.taskWrites || next.taskWrites
      ? {
          taskWrites: {
            ids: [
              ...new Set([...(previous.taskWrites?.ids ?? []), ...(next.taskWrites?.ids ?? [])])
            ],
            create: !!(previous.taskWrites?.create || next.taskWrites?.create),
            remove: !!(previous.taskWrites?.remove || next.taskWrites?.remove)
          }
        }
      : {}),
    ...(previous.documents || next.documents
      ? {
          documents: {
            read: [
              ...new Set([...(previous.documents?.read ?? []), ...(next.documents?.read ?? [])])
            ],
            write: [
              ...new Set([...(previous.documents?.write ?? []), ...(next.documents?.write ?? [])])
            ]
          }
        }
      : {})
  }
}

/** Permission upgrades are monotonic. Reductions use revocation and a fresh preview. */
export function containsExtensionAccess(
  next: ExtensionSelection,
  previous: ExtensionSelection
): boolean {
  return (
    previous.channelIds.every((id) => next.channelIds.includes(id)) &&
    previous.records.every((record) =>
      next.records.some((item) => item.id === record.id && item.schemaId === record.schemaId)
    ) &&
    (previous.containers ?? []).every((container) =>
      next.containers?.some(
        (item) =>
          item.id === container.id &&
          item.kind === container.kind &&
          (!container.descendants || item.descendants)
      )
    ) &&
    (!previous.taskWrites ||
      (!!next.taskWrites &&
        previous.taskWrites.ids.every((id) => next.taskWrites!.ids.includes(id)) &&
        (!previous.taskWrites.create || next.taskWrites.create) &&
        (!previous.taskWrites.remove || next.taskWrites.remove))) &&
    (previous.documents?.read ?? []).every((id) => next.documents?.read.includes(id)) &&
    (previous.documents?.write ?? []).every((id) => next.documents?.write?.includes(id))
  )
}
