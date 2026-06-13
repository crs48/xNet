/**
 * Explorer Spaces section (exploration 0179): the group primitive in the
 * sidebar. Lists active Spaces, creates new ones inline, and opens the share
 * dialog on a Space — inviting someone to a Space shares everything filed in it
 * at once (the invite is a share link with `docType: 'space'`).
 */
import type { SpaceKind } from '@xnetjs/data'
import { Building2, Plus, User, Users, UserPlus, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { ShareDialog } from '../../components/ShareDialog'
import { useSpaces } from '../../hooks/useSpaces'

const KIND_ICON: Record<SpaceKind, LucideIcon> = {
  personal: User,
  workspace: Users,
  organization: Building2,
  team: Users,
  project: Users,
  community: Users,
  family: Users
}

export function ExplorerSpacesSection() {
  const { spaces, createSpace } = useSpaces()
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [inviteSpaceId, setInviteSpaceId] = useState<string | null>(null)

  const submit = async () => {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (name) await createSpace({ name })
  }

  if (spaces.length === 0 && !creating) {
    return (
      <div className="shrink-0 px-1">
        <SectionHeader onAdd={() => setCreating(true)} />
      </div>
    )
  }

  return (
    <div className="max-h-[30%] shrink-0 overflow-y-auto px-1">
      <SectionHeader onAdd={() => setCreating(true)} />
      {creating && (
        <input
          autoFocus
          value={draft}
          placeholder="Space name…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') {
              setCreating(false)
              setDraft('')
            }
          }}
          onBlur={() => void submit()}
          className="mx-2 mb-1 h-[26px] w-[calc(100%-1rem)] rounded-sm border border-border bg-bg-1 px-2 text-xs text-ink-1 outline-none"
        />
      )}
      {spaces.map((space) => {
        const Icon = KIND_ICON[space.kind] ?? Users
        return (
          <div
            key={space.id}
            className="group flex h-[26px] w-full items-center gap-2 rounded-sm px-2 text-ink-2 transition-colors hover:bg-accent hover:text-ink-1"
          >
            <Icon size={13} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate text-xs">{space.name}</span>
            <button
              type="button"
              title={`Invite to ${space.name}`}
              onClick={() => setInviteSpaceId(space.id)}
              className="hidden shrink-0 cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1 group-hover:flex"
            >
              <UserPlus size={13} />
            </button>
          </div>
        )
      })}
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

function SectionHeader({ onAdd }: { onAdd: () => void }) {
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
