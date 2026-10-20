import type { ExtensionGrant } from './extension-data'
import type { CommunityData } from './use-community-data'
import { PageSchema, TaskSchema, FolderSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'

export type ExtensionSelection = Pick<
  ExtensionGrant,
  'channelIds' | 'records' | 'taskWrites' | 'documents' | 'containers'
>

export function canReadExtensionChannel(data: CommunityData, id: string): boolean {
  const channel = data.channels.find((channel) => channel.id === id)
  if (!channel || !data.did) return false
  if (channel.createdBy === data.did || channel.members?.includes(data.did)) return true
  if (channel.visibility === 'public') return true
  const space = data.spaces.find((space) => space.id === channel.space)
  return (
    !!space &&
    (space.createdBy === data.did ||
      space.visibility === 'public' ||
      data.members.some(
        (member) =>
          member.space === space.id &&
          member.member === data.did &&
          (!member.expiresAt || member.expiresAt > Date.now())
      ))
  )
}

export function ExtensionDataPicker({
  data,
  selection,
  onChange
}: {
  data: CommunityData
  selection: ExtensionSelection
  onChange: (selection: ExtensionSelection) => void
}) {
  const folders = useQuery(FolderSchema, { limit: 100, orderBy: { updatedAt: 'desc' } })
  const tasks = useQuery(TaskSchema, { limit: 100, orderBy: { updatedAt: 'desc' } })
  const pages = useQuery(PageSchema, { limit: 100, orderBy: { updatedAt: 'desc' } })
  const records = [
    ...tasks.data.map((node) => ({ ...node, schemaId: TaskSchema._schemaId, kind: 'Task' })),
    ...pages.data.map((node) => ({ ...node, schemaId: PageSchema._schemaId, kind: 'Page' }))
  ].filter((node) => node.createdBy === data.did)
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3 text-xs">
      <legend className="px-1 font-semibold">Data this extension can read</legend>
      <p className="text-muted-foreground">
        Only checked data is shared. Conversation access includes future messages. Task and page
        access covers the selected record’s properties.
      </p>
      <div className="max-h-44 space-y-2 overflow-auto">
        {data.channels
          .filter((channel) => canReadExtensionChannel(data, channel.id))
          .map((channel) => (
            <label key={channel.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selection.channelIds.includes(channel.id)}
                onChange={(event) =>
                  onChange({
                    ...selection,
                    channelIds: event.target.checked
                      ? [...selection.channelIds, channel.id]
                      : selection.channelIds.filter((id) => id !== channel.id)
                  })
                }
              />
              {channel.name || 'Conversation'} · messages
            </label>
          ))}
      </div>
      <details>
        <summary className="cursor-pointer">
          Choose folders and spaces ({selection.containers?.length ?? 0} selected)
        </summary>
        <p className="mt-2 text-muted-foreground">
          Allows task and page properties in these containers, including future records and nested
          containers. Page text and editing still need separate approval. Space access never exceeds
          your current membership.
        </p>
        {folders.error && <p role="alert">Could not load folders.</p>}
        <div className="mt-2 max-h-44 space-y-2 overflow-auto">
          {[
            ...folders.data
              .filter((folder) => folder.createdBy === data.did)
              .map((folder) => ({ id: folder.id, name: folder.name, kind: 'folder' as const })),
            ...data.spaces.map((space) => ({
              id: space.id,
              name: space.name,
              kind: 'space' as const
            }))
          ].map((container) => (
            <label key={container.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  !!selection.containers?.some(
                    (item) => item.id === container.id && item.kind === container.kind
                  )
                }
                onChange={(event) =>
                  onChange({
                    ...selection,
                    containers: event.target.checked
                      ? [
                          ...(selection.containers ?? []),
                          { id: container.id, kind: container.kind, descendants: true }
                        ]
                      : selection.containers?.filter(
                          (item) => item.id !== container.id || item.kind !== container.kind
                        )
                  })
                }
              />
              {container.name || 'Untitled'} · {container.kind} and descendants
            </label>
          ))}
        </div>
        <p className="mt-2 text-muted-foreground">
          Showing up to 100 recent folders. Up to ten selections and one hundred nested containers
          per extension.
        </p>
      </details>
      <details>
        <summary className="cursor-pointer">
          Choose your tasks and pages ({selection.records.length} selected)
        </summary>
        {(tasks.error || pages.error) && <p role="alert">Could not load the available records.</p>}
        <div className="mt-2 max-h-44 space-y-2 overflow-auto">
          {records.map((record) => (
            <label key={record.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selection.records.some((item) => item.id === record.id)}
                onChange={(event) =>
                  onChange({
                    ...selection,
                    taskWrites: undefined,
                    documents: undefined,
                    records: event.target.checked
                      ? [...selection.records, { id: record.id, schemaId: record.schemaId }]
                      : selection.records.filter((item) => item.id !== record.id)
                  })
                }
              />
              {record.title || 'Untitled'} · {record.kind}
            </label>
          ))}
          {!records.length && (
            <p className="text-muted-foreground">No personal tasks or pages to select.</p>
          )}
        </div>
        <p className="mt-2 text-muted-foreground">
          Showing up to 100 recent tasks and 100 recent pages. Document text needs separate
          approval; attachments are excluded.
        </p>
      </details>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!selection.documents}
          onChange={(event) =>
            onChange({
              ...selection,
              documents: event.target.checked
                ? {
                    read: selection.records
                      .filter((record) => record.schemaId === PageSchema._schemaId)
                      .map((record) => record.id)
                  }
                : undefined
            })
          }
        />
        Allow reading selected page text (up to ten pages)
      </label>
      {selection.documents && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!selection.documents.write?.length}
            onChange={(event) =>
              onChange({
                ...selection,
                documents: {
                  ...selection.documents!,
                  write: event.target.checked ? [...selection.documents!.read] : undefined
                }
              })
            }
          />
          Allow editing selected private page text
        </label>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!selection.taskWrites}
          onChange={(event) =>
            onChange({
              ...selection,
              taskWrites: event.target.checked
                ? {
                    ids: selection.records
                      .filter((record) => record.schemaId === TaskSchema._schemaId)
                      .map((record) => record.id),
                    create: false,
                    remove: false
                  }
                : undefined
            })
          }
        />
        Allow editing selected private tasks
      </label>
      {selection.taskWrites && (
        <div className="space-y-2 border-l border-border pl-3">
          <p className="text-muted-foreground">
            Title, status, completion, priority, and due date only. Shared-space tasks cannot be
            edited. Private folder tasks need their folder selected above.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selection.taskWrites.create}
              onChange={(event) =>
                onChange({
                  ...selection,
                  taskWrites: { ...selection.taskWrites!, create: event.target.checked }
                })
              }
            />
            Allow creating private tasks
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selection.taskWrites.remove}
              onChange={(event) =>
                onChange({
                  ...selection,
                  taskWrites: { ...selection.taskWrites!, remove: event.target.checked }
                })
              }
            />
            Allow deleting and restoring these tasks
          </label>
        </div>
      )}
    </fieldset>
  )
}
