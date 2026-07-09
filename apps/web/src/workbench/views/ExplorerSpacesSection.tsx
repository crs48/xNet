/**
 * Explorer Spaces section (explorations 0179 + 0181): the people-container
 * primitive in the sidebar. Lists active Spaces as a nesting tree, creates new
 * ones inline (with a kind), opens a Space's home, sets the active scope, and
 * opens the share dialog to invite someone to a whole Space at once.
 */
import { useNavigate } from '@tanstack/react-router'
import { type SpaceKind, type SpaceTreeNode } from '@xnetjs/data'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Globe,
  Heart,
  Plus,
  User,
  Users,
  UserPlus,
  type LucideIcon
} from 'lucide-react'
import { useState } from 'react'
import { ShareDialog } from '../../components/ShareDialog'
import { useSpaces, type SpaceEntry } from '../../hooks/useSpaces'
import { navigateToNode } from '../navigation'
import { useWorkbench } from '../state'
import { setPreviewIntent } from '../tabs'

const KIND_ICON: Record<SpaceKind, LucideIcon> = {
  personal: User,
  workspace: Users,
  organization: Building2,
  team: Users,
  community: Globe,
  family: Heart
}

const CREATE_KINDS: Array<{ id: SpaceKind; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'team', label: 'Team' },
  { id: 'organization', label: 'Organization' },
  { id: 'community', label: 'Community' },
  { id: 'family', label: 'Family' }
]

export function ExplorerSpacesSection() {
  const navigate = useNavigate()
  const { tree, createSpace } = useSpaces()
  const currentSpaceId = useWorkbench((s) => s.currentSpaceId)
  const setCurrentSpace = useWorkbench((s) => s.setCurrentSpace)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftKind, setDraftKind] = useState<SpaceKind>('workspace')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [inviteSpaceId, setInviteSpaceId] = useState<string | null>(null)

  const submit = async () => {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (name) await createSpace({ name, kind: draftKind })
  }

  const openSpace = (id: string) => {
    setCurrentSpace(id)
    setPreviewIntent()
    navigateToNode(navigate, 'space', id)
  }

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const hasSpaces = tree.length > 0

  return (
    <div className="px-1">
      <SectionHeader onAdd={() => setCreating(true)} />
      {creating && (
        <div className="mx-2 mb-1 flex items-center gap-1">
          <select
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as SpaceKind)}
            className="h-[26px] rounded-sm border border-border bg-bg-1 px-1 text-[11px] text-ink-2 outline-none"
          >
            {CREATE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={draft}
            placeholder="Name…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') {
                setCreating(false)
                setDraft('')
              }
            }}
            onBlur={() => void submit()}
            className="h-[26px] min-w-0 flex-1 rounded-sm border border-border bg-bg-1 px-2 text-xs text-ink-1 outline-none"
          />
        </div>
      )}
      {hasSpaces &&
        tree.map((node) => (
          <SpaceRow
            key={node.folder.id}
            node={node}
            depth={0}
            currentSpaceId={currentSpaceId}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onOpen={openSpace}
            onInvite={setInviteSpaceId}
          />
        ))}
      {inviteSpaceId && (
        <ShareDialog
          docId={inviteSpaceId}
          docType="space"
          isOpen
          onClose={() => setInviteSpaceId(null)}
        />
      )}
    </div>
  )
}

function SpaceRow({
  node,
  depth,
  currentSpaceId,
  collapsed,
  onToggleCollapsed,
  onOpen,
  onInvite
}: {
  node: SpaceTreeNode<SpaceEntry>
  depth: number
  currentSpaceId: string | null
  collapsed: Set<string>
  onToggleCollapsed: (id: string) => void
  onOpen: (id: string) => void
  onInvite: (id: string) => void
}) {
  const space = node.folder
  const Icon = KIND_ICON[space.kind] ?? Users
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(space.id)
  const isActive = currentSpaceId === space.id

  return (
    <>
      <div
        className={`group flex h-[26px] w-full items-center gap-1 rounded-sm pr-2 text-ink-2 transition-colors hover:bg-accent hover:text-ink-1 ${
          isActive ? 'bg-accent text-ink-1' : ''
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <button
          type="button"
          onClick={() => (hasChildren ? onToggleCollapsed(space.id) : undefined)}
          className="flex size-4 shrink-0 items-center justify-center text-ink-3"
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onOpen(space.id)}
          className="flex min-w-0 flex-1 items-center gap-2 border-none bg-transparent text-left"
        >
          {space.icon ? (
            <span className="shrink-0 text-[13px] leading-none">{space.icon}</span>
          ) : (
            <Icon size={13} className="shrink-0 text-ink-3" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs">{space.name}</span>
        </button>
        <button
          type="button"
          title={`Invite to ${space.name}`}
          onClick={() => onInvite(space.id)}
          className="hidden shrink-0 cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1 group-hover:flex"
        >
          <UserPlus size={13} />
        </button>
      </div>
      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <SpaceRow
            key={child.folder.id}
            node={child}
            depth={depth + 1}
            currentSpaceId={currentSpaceId}
            collapsed={collapsed}
            onToggleCollapsed={onToggleCollapsed}
            onOpen={onOpen}
            onInvite={onInvite}
          />
        ))}
    </>
  )
}

function SectionHeader({ onAdd }: { onAdd: () => void }) {
  // Scope filtering moved to the Scope Bar (exploration 0190); this header is
  // now navigation/manage only — open a Space home, create a new one.
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Spaces</span>
      <button
        type="button"
        title="New space"
        onClick={onAdd}
        className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
      >
        <Plus size={13} />
      </button>
    </div>
  )
}
