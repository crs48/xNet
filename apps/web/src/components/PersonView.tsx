/**
 * PersonView — the per-person dashboard an @mention opens (exploration 0172).
 *
 * A DID is the stable identity; this view is the human layer on top: the
 * profile (name/avatar/status), a one-click DM, and the things this person
 * touched — content they created, tasks they're assigned, and the channels you
 * share. Everything is resolved from bounded workspace queries filtered
 * client-side by DID (the 0169 filterTagged pattern), so no schema needs a
 * per-author index. Renders from a bare DID even when no Profile node exists.
 */
import type { TabNodeType } from '../workbench/state'
import { useNavigate } from '@tanstack/react-router'
import {
  CanvasSchema,
  ChannelSchema,
  DashboardSchema,
  DatabaseSchema,
  PageSchema,
  ProfileSchema,
  TaskSchema
} from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useDmOpen } from '../hooks/useDmOpen'
import { DIDAvatar } from '@xnetjs/ui'
import { MessageCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { channelLabel, displayName as resolveName, type ProfileEntry } from '../comms/comms-utils'
import { useComms } from '../comms/CommsContext'
import { useProfiles } from '../comms/hooks'
import { navigateToNode } from '../workbench/navigation'
import { usePublishTitle } from '../workbench/route-title'
import { useWorkbench } from '../workbench/state'
import { PersonActions } from './PersonActions'

const BOUNDED = { orderBy: { updatedAt: 'desc' as const }, limit: 200 }

interface CreatedRow {
  id: string
  title: string
  type: TabNodeType
}

interface NodeLike {
  id: string
  title?: string
  name?: string
  createdBy?: string
}

/** Content this person authored, across the linkable node kinds. */
function useCreatedContent(did: string): CreatedRow[] {
  const { data: pages } = useQuery(PageSchema, BOUNDED)
  const { data: databases } = useQuery(DatabaseSchema, BOUNDED)
  const { data: canvases } = useQuery(CanvasSchema, BOUNDED)
  const { data: dashboards } = useQuery(DashboardSchema, BOUNDED)
  return useMemo(() => {
    const groups: Array<{ type: TabNodeType; docs: unknown }> = [
      { type: 'page', docs: pages },
      { type: 'database', docs: databases },
      { type: 'canvas', docs: canvases },
      { type: 'dashboard', docs: dashboards }
    ]
    const rows: CreatedRow[] = []
    for (const { type, docs } of groups) {
      for (const doc of (docs ?? []) as NodeLike[]) {
        if (doc.createdBy !== did) continue
        rows.push({ id: doc.id, title: doc.title?.trim() || doc.name?.trim() || 'Untitled', type })
      }
    }
    return rows.slice(0, 50)
  }, [pages, databases, canvases, dashboards, did])
}

interface TaskRow {
  id: string
  title: string
  status?: string
}

/** Tasks where this person is the (or an) assignee. */
function useAssignedTasks(did: string): TaskRow[] {
  const { data } = useQuery(TaskSchema, BOUNDED)
  return useMemo(() => {
    const rows = (data ?? []) as Array<{
      id: string
      title?: string
      status?: string
      assignee?: string
      assignees?: string[]
    }>
    return rows
      .filter((t) => t.assignee === did || (t.assignees ?? []).includes(did))
      .map((t) => ({ id: t.id, title: t.title?.trim() || 'Untitled task', status: t.status }))
      .slice(0, 50)
  }, [data, did])
}

interface ChannelRow {
  id: string
  label: string
}

/** Channels and DMs you both belong to. */
function useSharedChannels(did: string, meDid: string, profiles: ProfileEntry[]): ChannelRow[] {
  const { data } = useQuery(ChannelSchema, { orderBy: { createdAt: 'asc' as const } })
  return useMemo(() => {
    const rows = (data ?? []) as Array<{
      id: string
      name?: string
      kind?: string
      members?: string[]
      archived?: boolean
    }>
    return rows
      .filter(
        (c) => !c.archived && (c.members ?? []).includes(did) && (c.members ?? []).includes(meDid)
      )
      .map((c) => ({
        id: c.id,
        label: channelLabel(
          { id: c.id, name: c.name, kind: c.kind, members: c.members },
          meDid,
          profiles
        )
      }))
  }, [data, did, meDid, profiles])
}

function Section({
  title,
  count,
  children
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-ink-3">
        {title} {count > 0 && <span className="text-ink-3">({count})</span>}
      </h2>
      {count === 0 ? <p className="m-0 text-xs text-ink-3">Nothing yet.</p> : children}
    </section>
  )
}

export function PersonView({ did }: { did: string }) {
  const navigate = useNavigate()
  const { me } = useComms()
  const { openDm } = useDmOpen()
  const [requested, setRequested] = useState(false)
  const profiles = useProfiles()
  const { data: profileNodes } = useQuery(ProfileSchema, { orderBy: { createdAt: 'desc' } })

  // Newest Profile authored for this DID is canonical (see ProfileSchema docs).
  const profile = useMemo(
    () => (profileNodes ?? []).find((p) => p.did === did),
    [profileNodes, did]
  )

  const name = resolveName(did, profiles)
  const handle = profile?.handle?.trim()
  const statusEmoji = profile?.statusEmoji
  const statusMessage = profile?.statusMessage
  const isSelf = did === me.did

  const created = useCreatedContent(did)
  const tasks = useAssignedTasks(did)
  const channels = useSharedChannels(did, me.did, profiles)

  // Publish the resolved display name as this route's title (0353).
  usePublishTitle(did, name)

  const message = useCallback(async () => {
    if (isSelf) return
    const result = await openDm(did)
    if ('requested' in result) setRequested(true)
  }, [isSelf, did, openDm])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-start gap-4">
        <DIDAvatar did={did} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 flex items-center gap-2 text-lg font-semibold text-ink-1">
            {name}
            {isSelf && <span className="text-xs font-normal text-ink-3">(you)</span>}
          </h1>
          {handle && <p className="m-0 text-sm text-ink-3">@{handle}</p>}
          {statusMessage && (
            <p className="m-0 mt-0.5 text-sm text-ink-2">
              {statusEmoji} {statusMessage}
            </p>
          )}
          <p className="m-0 mt-1 truncate font-mono text-[11px] text-ink-3" title={did}>
            {did}
          </p>
        </div>
        {!isSelf && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void message()}
              disabled={requested}
              className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <MessageCircle size={14} strokeWidth={1.5} />
              {requested ? 'Request sent' : 'Message'}
            </button>
            <PersonActions did={did} label={name} />
          </div>
        )}
      </header>

      <Section title="Assigned tasks" count={tasks.length}>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => navigateToNode(navigate, 'tasks', 'tasks')}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-2 text-left text-xs text-ink-1 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.status && (
                  <span className="shrink-0 rounded-full border border-hairline px-1.5 py-px text-[10px] text-ink-3">
                    {task.status}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Created" count={created.length}>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {created.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => navigateToNode(navigate, row.type, row.id)}
                className="flex w-full items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-2 text-left text-xs text-ink-1 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
                  {row.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Shared channels & DMs" count={channels.length}>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {channels.map((channel) => (
            <li key={channel.id}>
              <button
                type="button"
                onClick={() => navigateToNode(navigate, 'channel', channel.id)}
                className="flex w-full items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-2 text-left text-xs text-ink-1 transition-colors hover:bg-surface-2"
              >
                {channel.label}
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
