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
import { DIDAvatar, useTheme } from '@xnetjs/ui'
import { FolderPlus, Inbox, Link2, LogOut, Moon, Pin, Settings, Sun, User } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useRequestCount } from '../hooks/useRequestCount'
import { DOC_TYPE_ROUTES } from '../lib/doc-creation'
import { logout } from '../lib/identity'
import { useNewActions } from './new-actions'
import { useWorkbench } from './state'
import { SURFACES, useSurfaceActivation } from './surfaces'

export type FloatingMenuName = 'new' | 'notif' | 'profile' | 'surfaces'

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

/** The canonical, Space-aware New menu — one source for every "New" (0288). */
function NewMenu({ close }: { close: () => void }) {
  const { types, targetName, createDoc, createFolder, addShared } = useNewActions()
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
  const { identity } = useIdentity()
  const { resolvedTheme, toggleTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const go = (to: string) => {
    void navigate({ to })
    close()
  }
  return (
    <div className="w-[236px] p-1.5">
      <div className="flex items-center gap-2.5 px-2 pb-2.5 pt-1">
        {identity && <DIDAvatar did={identity.did} size={32} />}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-1">You</div>
          <div className="truncate font-mono text-[11px] text-ink-3">{identity?.did ?? '—'}</div>
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
        {menu.name === 'notif' && <NotifMenu close={onClose} />}
        {menu.name === 'profile' && <ProfileMenu close={onClose} />}
        {menu.name === 'surfaces' && <SurfacesMenu close={onClose} />}
      </div>
    </>,
    document.body
  )
}
