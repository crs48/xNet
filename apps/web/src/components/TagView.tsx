/**
 * TagView — the tag detail page (exploration 0169).
 *
 * A tag is a feed: everything carrying the tag, grouped by type, plus
 * management (rename — propagates by reference, archive, merge). Merge
 * re-points the `tags` relation on every loaded tagged node and archives
 * the source; stale references keep resolving because archived tags are
 * never deleted. Phase 3 attaches a discussion channel via Channel.target.
 */
import type { ExplorerNodeType } from '../workbench/views/explorer-rows'
import { useNavigate } from '@tanstack/react-router'
import { createChannel } from '@xnetjs/comms'
import {
  CanvasSchema,
  ChannelSchema,
  DashboardSchema,
  DatabaseSchema,
  PageSchema,
  TagSchema,
  TaskSchema,
  normalizeTagName
} from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { Archive, ArchiveRestore, Hash, Merge, MessageSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ChannelChat } from '../comms/ChannelChat'
import { navigateToNode } from '../workbench/navigation'
import { usePublishTitle } from '../workbench/route-title'
import { TAB_VIEWS } from '../workbench/tabs'
import { filterTagged, mergeTagOps, type TaggedRef } from './tag-view-data'

const QUERY_LIMIT = 500
const QUERY_OPTIONS = { orderBy: { updatedAt: 'desc' as const }, limit: QUERY_LIMIT }

interface TagEntity {
  id: string
  name: string
  description?: string
  archived: boolean
}

interface TaggedItem extends TaggedRef {
  title: string
  type: ExplorerNodeType
}

interface TagSectionData {
  label: string
  items: TaggedItem[]
}

function useTagPageData(tagId: string) {
  const { data: tagDocs } = useQuery(TagSchema, { orderBy: { name: 'asc' } })
  const { data: pages } = useQuery(PageSchema, QUERY_OPTIONS)
  const { data: databases } = useQuery(DatabaseSchema, QUERY_OPTIONS)
  const { data: canvases } = useQuery(CanvasSchema, QUERY_OPTIONS)
  const { data: dashboards } = useQuery(DashboardSchema, QUERY_OPTIONS)
  const { data: tasks } = useQuery(TaskSchema, QUERY_OPTIONS)

  const tag = useMemo<TagEntity | null>(() => {
    const doc = (tagDocs ?? []).find((entry) => entry.id === tagId)
    if (!doc) return null
    return {
      id: doc.id,
      name: doc.name ?? '',
      description: doc.description,
      archived: doc.archived === true
    }
  }, [tagDocs, tagId])

  const otherTags = useMemo(
    () =>
      (tagDocs ?? [])
        .filter((entry) => entry.id !== tagId && entry.archived !== true)
        .map((entry) => ({ id: entry.id, name: entry.name ?? '' })),
    [tagDocs, tagId]
  )

  const sections = useMemo<TagSectionData[]>(() => {
    const collect = (
      docs: Array<{ id: string; title?: string; tags?: string[] }> | null | undefined,
      type: ExplorerNodeType,
      label: string
    ): TagSectionData => ({
      label,
      items: filterTagged(docs, tagId).map((doc) => ({
        id: doc.id,
        title: doc.title ?? '',
        type,
        tags: doc.tags
      }))
    })
    return [
      collect(pages, 'page', 'Pages'),
      collect(databases, 'database', 'Databases'),
      collect(canvases, 'canvas', 'Canvases'),
      collect(dashboards, 'dashboard', 'Dashboards')
    ]
  }, [pages, databases, canvases, dashboards, tagId])

  const taggedTasks = useMemo(() => filterTagged(tasks, tagId), [tasks, tagId])

  const allTaggedRefs = useMemo<TaggedRef[]>(
    () => [
      ...sections.flatMap((section) => section.items),
      ...taggedTasks.map((task) => ({ id: task.id, tags: task.tags }))
    ],
    [sections, taggedTasks]
  )

  return { tag, otherTags, sections, taggedTasks, allTaggedRefs }
}

function TagNameEditor({ tag }: { tag: TagEntity }) {
  const { mutate } = useMutate()
  return (
    <input
      type="text"
      defaultValue={tag.name}
      aria-label="Tag name"
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      onBlur={(event) => {
        const name = normalizeTagName(event.target.value)
        if (name && name !== tag.name) {
          void mutate([{ type: 'update', id: tag.id, data: { name } }])
        } else {
          event.target.value = tag.name
        }
      }}
      className="w-full max-w-md border-none bg-transparent text-3xl font-bold tracking-tight text-ink-1 outline-none"
    />
  )
}

function TagActions({
  tag,
  otherTags,
  allTaggedRefs
}: ReturnType<typeof useTagPageData> & { tag: TagEntity }) {
  const { mutate } = useMutate()
  const [mergeTarget, setMergeTarget] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() =>
          void mutate([{ type: 'update', id: tag.id, data: { archived: !tag.archived } }])
        }
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-2 hover:bg-accent hover:text-ink-1"
      >
        {tag.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
        {tag.archived ? 'Unarchive' : 'Archive'}
      </button>

      {otherTags.length > 0 && (
        <span className="flex items-center gap-1">
          <select
            value={mergeTarget}
            onChange={(event) => setMergeTarget(event.target.value)}
            aria-label="Merge into tag"
            className="h-6 rounded-md border border-hairline bg-surface-0 px-1 text-xs text-ink-2"
          >
            <option value="">Merge into…</option>
            {otherTags.map((other) => (
              <option key={other.id} value={other.id}>
                #{other.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!mergeTarget}
            onClick={() => {
              const ops = mergeTagOps(tag.id, mergeTarget, allTaggedRefs)
              setMergeTarget('')
              void mutate(ops)
            }}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-2 hover:bg-accent hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
          >
            <Merge size={12} />
            Merge
          </button>
        </span>
      )}
    </div>
  )
}

function TaggedItemRow({ item }: { item: TaggedItem }) {
  const navigate = useNavigate()
  const Icon = TAB_VIEWS[item.type].icon
  return (
    <button
      type="button"
      onClick={() => navigateToNode(navigate, item.type, item.id)}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-accent hover:text-ink-1"
    >
      <Icon size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate">{item.title || 'Untitled'}</span>
    </button>
  )
}

function TaggedTasksSection({ tasks }: { tasks: Array<{ id: string; title?: string }> }) {
  const navigate = useNavigate()
  if (tasks.length === 0) return null
  return (
    <section>
      <h2 className="mb-1 mt-6 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        Tasks
      </h2>
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => void navigate({ to: '/tasks', search: { task: task.id } as never })}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-accent hover:text-ink-1"
        >
          <span className="min-w-0 flex-1 truncate">{task.title || 'Untitled task'}</span>
        </button>
      ))}
    </section>
  )
}

/**
 * The "hashtag is a channel" half of the tag page: a Channel attached
 * via the existing Channel.target relation hosts the tag's discussion.
 */
function TagDiscussion({ tag }: { tag: TagEntity }) {
  const bridge = useDataBridge()
  const { data: channels } = useQuery(ChannelSchema, { where: { target: tag.id } })
  const channel = (channels ?? []).find((entry) => entry.archived !== true)

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        Discussion
      </h2>
      {channel ? (
        <div className="h-80 overflow-hidden rounded-md border border-hairline">
          <ChannelChat channelId={channel.id} />
        </div>
      ) : (
        <button
          type="button"
          disabled={!bridge}
          onClick={() => void createChannel(bridge!, { name: `#${tag.name}`, target: tag.id })}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-2 hover:bg-accent hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
        >
          <MessageSquare size={12} />
          Start discussion
        </button>
      )}
    </section>
  )
}

/** Tagged content grouped by type, or the empty-state hint. */
function TagPageBody({
  tagName,
  sections,
  taggedTasks
}: {
  tagName: string
  sections: TagSectionData[]
  taggedTasks: Array<{ id: string; title?: string }>
}) {
  const total =
    sections.reduce((sum, section) => sum + section.items.length, 0) + taggedTasks.length

  if (total === 0) {
    return (
      <p className="mt-10 text-sm text-ink-3">
        Nothing carries this tag yet. Type #{tagName} in a page or message to tag it.
      </p>
    )
  }
  return (
    <>
      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <section key={section.label}>
              <h2 className="mb-1 mt-6 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                {section.label}
              </h2>
              {section.items.map((item) => (
                <TaggedItemRow key={item.id} item={item} />
              ))}
            </section>
          )
      )}
      <TaggedTasksSection tasks={taggedTasks} />
    </>
  )
}

export function TagView({ tagId }: { tagId: string }) {
  const data = useTagPageData(tagId)
  const { tag, sections, taggedTasks } = data

  usePublishTitle(tagId, tag?.name ? `#${tag.name}` : null, tag?.id)

  if (!tag) {
    return <p className="mt-10 text-center text-sm text-ink-3">Tag not found.</p>
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-2">
        <Hash size={26} strokeWidth={2} className="shrink-0 text-ink-3" />
        <TagNameEditor key={tag.id + tag.name} tag={tag} />
      </div>
      {tag.archived && (
        <p className="mt-1 text-xs text-ink-3">
          Archived — hidden from pickers; existing references keep working.
        </p>
      )}
      <div className="mt-3">
        <TagActions {...data} tag={tag} />
      </div>

      <TagPageBody tagName={tag.name} sections={sections} taggedTasks={taggedTasks} />

      <TagDiscussion tag={tag} />
    </div>
  )
}
