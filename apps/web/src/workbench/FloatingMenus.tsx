/**
 * FloatingMenus — the Floating shell's anchored popovers (exploration 0286).
 *
 * One popover open at a time, closed by a full-screen (transparent) backdrop.
 * Anchored to their trigger via the caller-supplied `DOMRect`: New below-left,
 * Notifications below-right, Profile below-left, Surfaces to the right. The
 * command palette is the app's existing GlobalSearch (⌘K), not one of these.
 */
import { useNavigate } from '@tanstack/react-router'
import { useIdentity } from '@xnetjs/react'
import { useTheme } from '@xnetjs/ui'
import {
  Check,
  FolderPlus,
  Globe,
  Inbox,
  Layers,
  Link2,
  LogOut,
  Moon,
  Pin,
  Settings,
  Sun,
  User
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCommsMaybe } from '../comms/CommsContext'
import { SelfAvatar } from '../components/SelfAvatar'
import { useRequestCount } from '../hooks/useRequestCount'
import { useSpaces } from '../hooks/useSpaces'
import { DOC_TYPE_ROUTES } from '../lib/doc-creation'
import { logout } from '../lib/identity'
import { useNewActions } from './new-actions'
import { useActivateSection, useSections } from './sidebar/SectionRows'
import { sectionIcon } from './sidebar/sections'
import { useWorkbench } from './state'
import { SURFACES, surfaceTabId, useSurfaceActivation } from './surfaces'
import { setPreviewIntent } from './tabs'
import { NO_SPACE } from './views/explorer-scope'

export type FloatingMenuName = 'new' | 'notif' | 'profile' | 'surfaces' | 'workspace'

export interface FloatingMenuState {
  name: FloatingMenuName
  rect: DOMRect
}

function positionFor(name: FloatingMenuName, rect: DOMRect): { left: number; top: number } {
  if (name === 'notif') {
    return { left: Math.max(10, rect.right - 340), top: rect.bottom + 8 }
  }
  if (name === 'surfaces') {
    return { left: rect.right + 8, top: Math.min(rect.top, window.innerHeight - 420) }
  }
  // new + profile: below-left of the trigger.
  return { left: rect.left, top: rect.bottom + 8 }
}

const item =
  'flex w-full items-center gap-2.5 rounded-lg border-none bg-transparent px-2 py-1.5 text-left text-[13px] text-ink-1 transition-colors hover:bg-accent cursor-pointer'
const eyebrow = 'px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3'

/**
 * The canonical, Space-aware New menu — the ONE place anything is created
 * (0288, widened to every creatable noun in 0387).
 *
 * Three groups: documents (Space-filed), then the non-document creatables,
 * then the filing/import verbs. The eyebrow's "Creating in <Space>" applies to
 * the document group only — channels and Spaces carry their own membership
 * semantics and are not filed by this menu.
 */
function NewMenu({ close }: { close: () => void }) {
  const { types, otherActions, targetName, createDoc, createFolder, runOther, addShared } =
    useNewActions()
  const run = (fn: () => void) => {
    fn()
    close()
  }
  return (
    <div className="w-[240px] p-1.5">
      <div className={eyebrow}>{targetName ? `Creating in ${targetName}` : 'New'}</div>
      {types.map((type) => {
        const route = DOC_TYPE_ROUTES[type]
        const Icon = route.icon
        return (
          <button
            key={type}
            type="button"
            className={item}
            onClick={() => run(() => createDoc(type))}
          >
            <Icon size={16} className="text-ink-3" />
            New {route.label.toLowerCase()}
            {type === 'page' && (
              <span className="ml-auto font-mono text-[11px] text-ink-3">⌘T</span>
            )}
          </button>
        )
      })}
      <div className="mx-0.5 my-1 h-px bg-hairline" />
      {otherActions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            type="button"
            className={item}
            onClick={() => run(() => runOther(action))}
          >
            <Icon size={16} strokeWidth={1.75} className="text-ink-3" />
            {action.label}
          </button>
        )
      })}
      <div className="mx-0.5 my-1 h-px bg-hairline" />
      <button type="button" className={item} onClick={() => run(() => void createFolder())}>
        <FolderPlus size={16} strokeWidth={1.75} className="text-ink-3" />
        New folder
      </button>
      <button type="button" className={item} onClick={() => run(addShared)}>
        <Link2 size={16} strokeWidth={1.75} className="text-ink-3" />
        Add shared…
      </button>
    </div>
  )
}

/** The Space (workspace) scope picker — sets `currentSpaceId` (0288). */
function WorkspaceMenu({ close }: { close: () => void }) {
  const currentSpaceId = useWorkbench((s) => s.currentSpaceId)
  const setCurrentSpace = useWorkbench((s) => s.setCurrentSpace)
  const { spaces } = useSpaces()
  const pick = (id: string | null) => {
    setCurrentSpace(id)
    close()
  }
  const Row = ({
    active,
    label,
    icon,
    onClick
  }: {
    active: boolean
    label: string
    icon: React.ReactNode
    onClick: () => void
  }) => (
    <button type="button" className={item} onClick={onClick}>
      <span className="flex w-4 justify-center text-ink-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check size={15} strokeWidth={2} className="text-ink-1" />}
    </button>
  )
  return (
    <div className="w-[250px] p-1.5">
      <div className={eyebrow}>Workspaces</div>
      <Row
        active={currentSpaceId === null}
        label="All workspaces"
        icon={<Globe size={16} strokeWidth={1.75} />}
        onClick={() => pick(null)}
      />
      {spaces.map((space) => (
        <Row
          key={space.id}
          active={currentSpaceId === space.id}
          label={space.name || 'Untitled workspace'}
          icon={
            space.icon ? (
              <span className="text-[14px] leading-none">{space.icon}</span>
            ) : (
              <Layers size={16} strokeWidth={1.75} />
            )
          }
          onClick={() => pick(space.id)}
        />
      ))}
      <Row
        active={currentSpaceId === NO_SPACE}
        label="No workspace"
        icon={<Layers size={16} strokeWidth={1.75} />}
        onClick={() => pick(NO_SPACE)}
      />
    </div>
  )
}

function NotifMenu({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const requestCount = useRequestCount()
  return (
    <div className="w-[340px] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <span className="text-[14px] font-semibold text-ink-1">Notifications</span>
      </div>
      <div className="px-1.5 pb-2">
        {requestCount > 0 ? (
          <button
            type="button"
            className={item}
            onClick={() => {
              void navigate({ to: '/requests' })
              close()
            }}
          >
            <Inbox size={16} strokeWidth={1.75} className="text-chart-1" />
            <span className="flex-1">
              You have <b className="font-semibold">{requestCount}</b> pending request
              {requestCount === 1 ? '' : 's'}
            </span>
          </button>
        ) : (
          <div className="px-2 py-6 text-center text-[13px] text-ink-3">You're all caught up.</div>
        )}
      </div>
    </div>
  )
}

function ProfileMenu({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const { did } = useIdentity()
  const me = useCommsMaybe()?.me
  const { resolvedTheme, toggleTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const go = (to: string) => {
    // Open as a preview tab (0288), same as clicking Settings anywhere else.
    setPreviewIntent()
    void navigate({ to })
    close()
  }
  return (
    <div className="w-[236px] p-1.5">
      <div className="flex items-center gap-2.5 px-2 pb-2.5 pt-1">
        {did && <SelfAvatar size={32} />}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink-1">
            {me?.name?.trim() || 'You'}
          </div>
          <div className="truncate font-mono text-[11px] text-ink-3">{did ?? '—'}</div>
        </div>
      </div>
      <div className="mx-0.5 mb-1 h-px bg-hairline" />
      <button type="button" className={item} onClick={() => go('/settings')}>
        <User size={16} strokeWidth={1.75} className="text-ink-3" />
        Profile
      </button>
      <button type="button" className={item} onClick={() => go('/settings')}>
        <Settings size={16} strokeWidth={1.75} className="text-ink-3" />
        Settings
      </button>
      <button
        type="button"
        className={item}
        onClick={() => {
          toggleTheme()
        }}
      >
        {dark ? (
          <Sun size={16} strokeWidth={1.75} className="text-ink-3" />
        ) : (
          <Moon size={16} strokeWidth={1.75} className="text-ink-3" />
        )}
        {dark ? 'Light mode' : 'Dark mode'}
      </button>
      <div className="mx-0.5 my-1 h-px bg-hairline" />
      <button
        type="button"
        className={item}
        onClick={() => {
          close()
          void logout()
        }}
      >
        <LogOut size={16} strokeWidth={1.75} className="text-ink-3" />
        Sign out
      </button>
    </div>
  )
}

/**
 * Sections roll-out (0353): the unified-nav counterpart to the surfaces
 * menu — one list of the user's sections (lenses + routes), each
 * pinnable to the primary rows.
 */
function SectionsMenu({ close }: { close: () => void }) {
  const { pinned, hidden } = useSections()
  const activate = useActivateSection()
  const toggleSectionPinned = useWorkbench((s) => s.toggleSectionPinned)
  const pinnedIds = new Set(pinned.map((section) => section.id))

  return (
    <div className="w-[256px] p-1.5">
      <div className="flex items-center justify-between px-2 pb-1 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          Sections
        </span>
        <span className="text-[11px] text-ink-3">Pin to keep visible</span>
      </div>
      {[...pinned, ...hidden].map((section) => {
        const Icon = sectionIcon(section)
        const isPinned = pinnedIds.has(section.id)
        // The pin is a SIBLING of the row, not a child: nesting it made the
        // row's accessible name "DiscoverPin" (one control announcing two
        // actions), and left the pin unreachable on its own by keyboard.
        return (
          <div key={section.id} className="flex items-center">
            <button
              type="button"
              className={`${item} flex-1`}
              onClick={() => {
                activate(section)
                close()
              }}
            >
              <Icon size={16} strokeWidth={1.75} className="text-ink-3" />
              <span className="flex-1 text-left">{section.label}</span>
            </button>
            <button
              type="button"
              aria-label={
                isPinned ? `Unpin ${section.label} from sidebar` : `Pin ${section.label} to sidebar`
              }
              aria-pressed={isPinned}
              onClick={() => toggleSectionPinned(section.id)}
              className={`shrink-0 rounded border-none bg-transparent px-1.5 py-1 text-[11px] cursor-pointer hover:bg-background-muted ${
                isPinned ? 'text-ink-1' : 'text-ink-3'
              }`}
            >
              {isPinned ? 'Pinned' : 'Pin'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function SurfacesMenu({ close }: { close: () => void }) {
  const navPinned = useWorkbench((s) => s.navPinned)
  const activeSurface = useWorkbench((s) => s.activeSurface)
  const toggleNavPinned = useWorkbench((s) => s.toggleNavPinned)
  const activate = useSurfaceActivation()
  return (
    <div className="w-[256px] p-1.5">
      <div className="flex items-center justify-between px-2 pb-1 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          Surfaces
        </span>
        <span className="text-[11px] text-ink-3">Pin to keep visible</span>
      </div>
      {SURFACES.map((surface) => {
        const Icon = surface.icon
        const pinned = navPinned.includes(surface.id)
        const active = activeSurface === surface.id
        return (
          <button
            key={surface.id}
            type="button"
            className={`${item} ${active ? 'bg-accent' : ''}`}
            onClick={() => {
              activate(surface)
              close()
            }}
            onDoubleClick={() => {
              const id = surfaceTabId(surface)
              if (id) useWorkbench.getState().promoteTab(id)
              close()
            }}
          >
            <Icon size={16} strokeWidth={1.75} className="text-ink-3" />
            <span className="flex-1">{surface.label}</span>
            <span
              role="button"
              tabIndex={0}
              title={pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
              onClick={(e) => {
                e.stopPropagation()
                toggleNavPinned(surface.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  toggleNavPinned(surface.id)
                }
              }}
              className={`flex items-center rounded p-1 ${
                pinned ? 'bg-accent text-ink-1' : 'text-ink-3 hover:text-ink-1'
              }`}
            >
              <Pin size={14} strokeWidth={1.75} className={pinned ? 'fill-current' : ''} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function FloatingMenus({
  menu,
  onClose
}: {
  menu: FloatingMenuState | null
  onClose: () => void
}) {
  // Unified nav (0353) shows sections; the legacy shell shows surfaces.
  const unifiedNav = useWorkbench((s) => !s.tabsEnabled)
  if (!menu) return null
  const { left, top } = positionFor(menu.name, menu.rect)
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 rounded-xl border border-hairline bg-popover text-popover-foreground shadow-pop"
        style={{ left, top }}
      >
        {menu.name === 'new' && <NewMenu close={onClose} />}
        {menu.name === 'workspace' && <WorkspaceMenu close={onClose} />}
        {menu.name === 'notif' && <NotifMenu close={onClose} />}
        {menu.name === 'profile' && <ProfileMenu close={onClose} />}
        {menu.name === 'surfaces' &&
          (unifiedNav ? <SectionsMenu close={onClose} /> : <SurfacesMenu close={onClose} />)}
      </div>
    </>,
    document.body
  )
}
