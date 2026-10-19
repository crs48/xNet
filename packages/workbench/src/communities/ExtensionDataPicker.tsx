import type { ExtensionGrant } from './extension-data'
import type { CommunityData } from './use-community-data'
import { PageSchema, TaskSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'

export type ExtensionSelection = Pick<ExtensionGrant, 'channelIds' | 'records'>

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
          Showing up to 100 recent tasks and 100 recent pages. Page text documents and attachments
          are not shared.
        </p>
      </details>
    </fieldset>
  )
}
