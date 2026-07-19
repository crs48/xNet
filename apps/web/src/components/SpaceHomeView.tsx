/**
 * SpaceHomeView — a Space's home (exploration 0181).
 *
 * One people-container, kind-themed: its people (with roles), its sub-spaces,
 * its projects, and its content. The header's primary action is **Invite** —
 * one share link grants a member access to everything filed in the Space at
 * once (a share link with `docType: 'space'`; the claim writes a membership
 * edge that the authorization cascade resolves against).
 */
import { useNavigate } from '@tanstack/react-router'
import {
  CanvasSchema,
  DatabaseSchema,
  PageSchema,
  ProjectSchema,
  TaskSchema,
  SPACE_ROLES,
  canManageSpace,
  effectiveSpaceRole,
  type SpaceKind,
  type SpaceRole,
  type SpaceVisibility
} from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { DIDAvatar } from '@xnetjs/ui'
import {
  Building2,
  CheckSquare2,
  FileText,
  FolderKanban,
  Globe,
  Heart,
  Link2,
  Lock,
  type LucideIcon,
  Pencil,
  User,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { displayName as resolveName } from '../comms/comms-utils'
import { useComms } from '../comms/CommsContext'
import { useProfiles } from '../comms/hooks'
import { useCreateInSpace } from '../hooks/useCreateInSpace'
import { useSpaceMembers, useSpaces } from '../hooks/useSpaces'
import { navigateToNode } from '../workbench/navigation'
import { usePublishTitle } from '../workbench/route-title'
import { type TabNodeType } from '../workbench/state'
import { CommunityFeed } from './community/CommunityFeed'
import { ShareDialog } from './ShareDialog'

const KIND_META: Record<SpaceKind, { icon: LucideIcon; label: string }> = {
  personal: { icon: User, label: 'Personal' },
  workspace: { icon: Users, label: 'Workspace' },
  organization: { icon: Building2, label: 'Organization' },
  team: { icon: Users, label: 'Team' },
  community: { icon: Globe, label: 'Community' },
  family: { icon: Heart, label: 'Family' }
}

const VISIBILITY_META: Record<SpaceVisibility, { icon: LucideIcon; label: string; tone: string }> =
  {
    private: { icon: Lock, label: 'Private', tone: 'text-ink-3' },
    unlisted: { icon: Link2, label: 'Unlisted', tone: 'text-amber-500' },
    public: { icon: Globe, label: 'Public', tone: 'text-emerald-500' }
  }

const BOUNDED = { orderBy: { updatedAt: 'desc' as const }, limit: 200 }

interface ContentRow {
  id: string
  title: string
  type: TabNodeType
}

function useSpaceContent(spaceId: string): { projects: ContentRow[]; content: ContentRow[] } {
  const { data: pages } = useQuery(PageSchema, BOUNDED)
  const { data: databases } = useQuery(DatabaseSchema, BOUNDED)
  const { data: canvases } = useQuery(CanvasSchema, BOUNDED)
  const { data: projects } = useQuery(ProjectSchema, BOUNDED)
  const { data: tasks } = useQuery(TaskSchema, BOUNDED)

  return useMemo(() => {
    const inSpace = (doc: { space?: string }) => doc.space === spaceId
    const projectRows: ContentRow[] = (
      (projects ?? []) as Array<{ id: string; name?: string; space?: string }>
    )
      .filter(inSpace)
      .map((p) => ({ id: p.id, title: p.name?.trim() || 'Untitled project', type: 'tasks' }))

    const groups: Array<{ type: TabNodeType; docs: unknown }> = [
      { type: 'page', docs: pages },
      { type: 'database', docs: databases },
      { type: 'canvas', docs: canvases }
    ]
    const content: ContentRow[] = []
    for (const { type, docs } of groups) {
      for (const doc of (docs ?? []) as Array<{
        id: string
        title?: string
        name?: string
        space?: string
      }>) {
        if (!inSpace(doc)) continue
        content.push({
          id: doc.id,
          title: doc.title?.trim() || doc.name?.trim() || 'Untitled',
          type
        })
      }
    }
    const taskRows = ((tasks ?? []) as Array<{ id: string; title?: string; space?: string }>)
      .filter(inSpace)
      .map((t) => ({ id: t.id, title: t.title?.trim() || 'Untitled task', type: 'tasks' as const }))

    return { projects: projectRows, content: [...content, ...taskRows].slice(0, 60) }
  }, [pages, databases, canvases, projects, tasks, spaceId])
}

function Section({
  title,
  count,
  action,
  children
}: {
  title: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-ink-3">
          {title}
          {typeof count === 'number' && count > 0 && (
            <span className="ml-1 text-ink-3">({count})</span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function ContentList({
  rows,
  emptyLabel,
  onOpen
}: {
  rows: ContentRow[]
  emptyLabel: string
  onOpen: (row: ContentRow) => void
}) {
  if (rows.length === 0) return <p className="m-0 text-xs text-ink-3">{emptyLabel}</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((row) => (
        <li key={`${row.type}:${row.id}`}>
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="flex w-full items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-2 text-left text-xs text-ink-1 transition-colors hover:bg-surface-2"
          >
            <RowIcon type={row.type} />
            <span className="min-w-0 flex-1 truncate">{row.title}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
              {row.type}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function RowIcon({ type }: { type: TabNodeType }) {
  const Icon = type === 'page' ? FileText : type === 'tasks' ? CheckSquare2 : FolderKanban
  return <Icon size={13} className="shrink-0 text-ink-3" />
}

/** Preset workspace colors for the space header swatch. */
const SPACE_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899'
] as const

/**
 * Manager-only editor for a Space's presentation fields. Previously these were
 * render-only (the "janky workspace editing" gap, exploration 0190) even though
 * `updateSpace`/`renameSpace` already supported them.
 */
function SpaceSettingsForm({
  spaceId,
  name,
  icon,
  color,
  description,
  onRename,
  onUpdate,
  onClose
}: {
  spaceId: string
  name: string
  icon?: string
  color?: string
  description?: string
  onRename: (spaceId: string, name: string) => Promise<void>
  onUpdate: (
    spaceId: string,
    patch: Partial<{ name: string; description: string; icon: string; color: string }>
  ) => Promise<void>
  onClose: () => void
}) {
  return (
    <Section
      title="Settings"
      action={
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-ink-1"
        >
          Done
        </button>
      }
    >
      <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-0 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-ink-3">Name</span>
          <input
            type="text"
            defaultValue={name}
            placeholder="Workspace name"
            className="rounded-md border border-hairline bg-bg-1 px-2 py-1.5 text-sm text-ink-1 outline-none focus:border-ink-3"
            onBlur={(e) => {
              const next = e.target.value.trim()
              if (next && next !== name) void onRename(spaceId, next)
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-ink-3">Icon (emoji)</span>
          <input
            type="text"
            defaultValue={icon ?? ''}
            maxLength={4}
            placeholder="🚀"
            className="w-20 rounded-md border border-hairline bg-bg-1 px-2 py-1.5 text-center text-lg outline-none focus:border-ink-3"
            onBlur={(e) => {
              const next = e.target.value.trim()
              if (next !== (icon ?? '')) void onUpdate(spaceId, { icon: next })
            }}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-ink-3">Color</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {SPACE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set color ${c}`}
                onClick={() => void onUpdate(spaceId, { color: c })}
                className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === c ? 'border-ink-1' : 'border-transparent'
                }`}
                style={{ background: c }}
              />
            ))}
            <button
              type="button"
              onClick={() => void onUpdate(spaceId, { color: '' })}
              className={`flex size-6 items-center justify-center rounded-full border-2 text-ink-3 transition-transform hover:scale-110 ${
                color ? 'border-transparent bg-surface-2' : 'border-ink-1 bg-surface-2'
              }`}
              title="No color"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-ink-3">Description</span>
          <textarea
            defaultValue={description ?? ''}
            rows={2}
            placeholder="What is this space for?"
            className="resize-y rounded-md border border-hairline bg-bg-1 px-2 py-1.5 text-sm text-ink-1 outline-none focus:border-ink-3"
            onBlur={(e) => {
              const next = e.target.value.trim()
              if (next !== (description ?? '')) void onUpdate(spaceId, { description: next })
            }}
          />
        </label>
      </div>
    </Section>
  )
}

export function SpaceHomeView({ spaceId }: { spaceId: string }) {
  const navigate = useNavigate()
  const { me } = useComms()
  const profiles = useProfiles()
  const { tree, getSpace, setSpaceVisibility, updateSpace, renameSpace } = useSpaces()
  const { members, setMemberRole, removeMember } = useSpaceMembers(spaceId)
  const { projects, content } = useSpaceContent(spaceId)
  const createInSpace = useCreateInSpace()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const space = getSpace(spaceId)
  const subSpaces = useMemo(() => tree.flatMap((n) => collectChildren(n, spaceId)), [tree, spaceId])

  usePublishTitle(spaceId, space?.name)

  const myRoles = useMemo<SpaceRole[]>(() => {
    const roles: SpaceRole[] = []
    const mine = members.find((m) => m.member === me.did)
    if (mine) roles.push(mine.role)
    if (space?.owners.includes(me.did)) roles.push('owner')
    return roles
  }, [members, me.did, space?.owners])
  const myRole = effectiveSpaceRole(myRoles)
  const canManage = myRole ? canManageSpace(myRole) : (space?.owners.includes(me.did) ?? false)

  if (!space) {
    return (
      <div className="mx-auto max-w-3xl text-sm text-ink-3">This Space is no longer available.</div>
    )
  }

  const Kind = KIND_META[space.kind] ?? KIND_META.workspace
  const KindIcon = Kind.icon
  const Vis = VISIBILITY_META[space.visibility]
  const VisIcon = Vis.icon
  const isPersonal = space.kind === 'personal'
  const isCommunity = space.kind === 'community'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-start gap-4">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-hairline text-ink-2"
          style={
            space.color
              ? { background: space.color, color: '#fff', borderColor: 'transparent' }
              : undefined
          }
        >
          {space.icon ? (
            <span className="text-2xl leading-none">{space.icon}</span>
          ) : (
            <KindIcon size={26} strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-lg font-semibold text-ink-1">{space.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-hairline px-2 py-px text-[10px] uppercase tracking-wider text-ink-3">
              {Kind.label}
            </span>
            <span className={`flex items-center gap-1 text-[11px] ${Vis.tone}`}>
              <VisIcon size={12} /> {Vis.label}
            </span>
            {!isPersonal && (
              <span className="flex items-center gap-1 text-[11px] text-ink-3">
                <Users size={12} /> {members.length} {members.length === 1 ? 'member' : 'members'}
              </span>
            )}
          </div>
          {space.description && <p className="m-0 mt-2 text-sm text-ink-2">{space.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canManage && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
              title="Edit space details"
              className={`flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2 ${
                editing ? 'bg-surface-2 text-ink-1' : 'bg-surface-0 text-ink-2'
              }`}
            >
              <Pencil size={14} strokeWidth={1.5} /> Edit
            </button>
          )}
          {!isPersonal && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-hairline bg-accent px-3 py-1.5 text-xs font-medium text-ink-1 transition-colors hover:bg-surface-2"
            >
              <UserPlus size={14} strokeWidth={1.5} /> Invite
            </button>
          )}
        </div>
      </header>

      {editing && canManage && (
        <SpaceSettingsForm
          spaceId={spaceId}
          name={space.name}
          icon={space.icon}
          color={space.color}
          description={space.description}
          onRename={renameSpace}
          onUpdate={updateSpace}
          onClose={() => setEditing(false)}
        />
      )}

      {/*
        A community leads with its discussion — the feed sits above the member
        list and content, because what a community is *for* is the conversation
        (exploration 0359). Other Space kinds keep the content-first layout.
      */}
      {isCommunity && (
        <Section title="Discussion">
          <CommunityFeed spaceId={spaceId} viewerDid={me?.did ?? null} />
        </Section>
      )}

      {!isPersonal && (
        <Section
          title="Members"
          count={members.length}
          action={
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-ink-1"
            >
              <Link2 size={12} /> Invite by link
            </button>
          }
        >
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-2"
              >
                <DIDAvatar did={m.member} size={24} />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-1">
                  {resolveName(m.member, profiles)}
                  {m.member === me.did && <span className="ml-1 text-ink-3">(you)</span>}
                </span>
                {canManage && m.member !== me.did ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => void setMemberRole(m.member, e.target.value as SpaceRole)}
                      className="rounded-sm border border-hairline bg-bg-1 px-1.5 py-0.5 text-[11px] capitalize text-ink-2 outline-none"
                    >
                      {SPACE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title="Remove member"
                      onClick={() => void removeMember(m.member)}
                      className="flex items-center p-0.5 text-ink-3 transition-colors hover:text-red-500"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <span className="shrink-0 rounded-full border border-hairline px-1.5 py-px text-[10px] capitalize text-ink-3">
                    {m.role}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {subSpaces.length > 0 && (
        <Section title="Sub-spaces" count={subSpaces.length}>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {subSpaces.map((child) => {
              const ChildIcon = (KIND_META[child.kind] ?? KIND_META.workspace).icon
              return (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => navigateToNode(navigate, 'space', child.id)}
                    className="flex w-full items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-2 text-left text-xs text-ink-1 transition-colors hover:bg-surface-2"
                  >
                    <ChildIcon size={13} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">{child.name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
                      {(KIND_META[child.kind] ?? KIND_META.workspace).label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section title="Projects" count={projects.length}>
        <ContentList
          rows={projects}
          emptyLabel="No projects yet."
          onOpen={() => navigateToNode(navigate, 'tasks', 'tasks')}
        />
      </Section>

      <Section
        title="Content"
        count={content.length}
        action={
          <button
            type="button"
            onClick={() => void createInSpace('page', spaceId)}
            className="flex items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-ink-1"
          >
            <FileText size={12} /> New page
          </button>
        }
      >
        <ContentList
          rows={content}
          emptyLabel="Nothing filed in this Space yet."
          onOpen={(row) =>
            row.type === 'tasks'
              ? navigateToNode(navigate, 'tasks', 'tasks')
              : navigateToNode(navigate, row.type, row.id)
          }
        />
      </Section>

      {canManage && !isPersonal && (
        <Section title="Visibility">
          <div className="flex items-center gap-2">
            {(['private', 'unlisted', 'public'] as SpaceVisibility[]).map((v) => {
              const Meta = VISIBILITY_META[v]
              const Icon = Meta.icon
              const active = space.visibility === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => void setSpaceVisibility(spaceId, v)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? 'border-ink-3 bg-surface-2 text-ink-1'
                      : 'border-hairline bg-surface-0 text-ink-3 hover:bg-surface-2'
                  }`}
                >
                  <Icon size={13} /> {Meta.label}
                </button>
              )
            })}
          </div>
          {space.visibility === 'public' && (
            <p className="m-0 text-[11px] text-amber-500">
              Anyone with the link can read public content in this Space.
            </p>
          )}
        </Section>
      )}

      {inviteOpen && (
        <ShareDialog docId={spaceId} docType="space" isOpen onClose={() => setInviteOpen(false)} />
      )}
    </div>
  )
}

interface SpaceTreeLike {
  folder: { id: string; name: string; kind: SpaceKind }
  children: SpaceTreeLike[]
}

/** Direct children of the matching node in the space tree. */
function collectChildren(
  node: SpaceTreeLike,
  targetId: string
): Array<{ id: string; name: string; kind: SpaceKind }> {
  if (node.folder.id === targetId) {
    return node.children.map((c) => c.folder)
  }
  return node.children.flatMap((c) => collectChildren(c, targetId))
}
