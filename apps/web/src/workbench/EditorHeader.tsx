/**
 * EditorHeader — the Floating shell's 50px editor chrome (exploration 0286).
 *
 * Sits at the top of the editor base surface (which is NOT an island): sidebar
 * toggle, the active node's breadcrumb, a collaborator facepile, Share, and the
 * comments / notifications / more actions. The pill-tab strip renders below it
 * (EditorArea's `pill` variant); the document is the router outlet under that.
 */
import type { ShareDocType } from '../hooks/useShareLinks'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useIdentity } from '@xnetjs/react'
import { viewRegistry } from '@xnetjs/views'
import {
  Bell,
  Database,
  FileText,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Share2,
  Table,
  type LucideIcon
} from 'lucide-react'
import { useState } from 'react'
import { SelfAvatar } from '../components/SelfAvatar'
import { ShareDialog } from '../components/ShareDialog'
import { useRequestCount } from '../hooks/useRequestCount'
import { navigateToFrame, navigateToNode, parseFrameSpec } from './navigation'
import { useRouteTitle } from './route-title'
import { selectActiveTab, useWorkbench, type TabNodeType } from './state'
import { tabFromPathname } from './tabs'

const SHARE_TYPES: Partial<Record<TabNodeType, ShareDocType>> = {
  page: 'page',
  database: 'database',
  canvas: 'canvas',
  dashboard: 'dashboard',
  savedview: 'view',
  space: 'space',
  channel: 'channel'
}

const TAB_ICON: Partial<Record<TabNodeType, LucideIcon>> = {
  page: FileText,
  database: Database,
  dashboard: LayoutDashboard,
  data: Table
}

const iconBtn =
  'flex h-[30px] w-[30px] items-center justify-center rounded-lg border-none bg-transparent text-ink-2 transition-colors hover:bg-background-muted hover:text-ink-1'

/**
 * "Open with…" (0346): a database (or frame) tab reopens through any
 * ViewRegistry view — table routes to the full database surface, every
 * other type opens as a frame tab. Plugin views appear the moment they
 * register; no app edits per view.
 */
function OpenWithSelect({ nodeType, nodeId }: { nodeType: TabNodeType; nodeId: string }) {
  const navigate = useNavigate()
  const spec = nodeType === 'frame' ? parseFrameSpec(nodeId) : null
  const targetNodeId = nodeType === 'frame' ? spec?.nodeId : nodeId
  if (!targetNodeId) return null
  const current = nodeType === 'frame' ? (spec?.viewType ?? 'table') : 'table'

  return (
    <select
      aria-label="Open with…"
      title="Open with…"
      value={current}
      onChange={(e) => {
        const viewType = e.target.value
        if (viewType === 'table') {
          navigateToNode(navigate, 'database', targetNodeId, { preview: false })
        } else {
          navigateToFrame(navigate, viewType, targetNodeId, { preview: false })
        }
      }}
      className="h-[26px] shrink-0 rounded-lg border border-hairline bg-transparent px-1.5 text-xs text-ink-2 outline-none hover:bg-background-muted"
    >
      <option value="table">table</option>
      {viewRegistry.getAll().map((v) => (
        <option key={v.type} value={v.type}>
          {v.type}
        </option>
      ))}
    </select>
  )
}

export function EditorHeader({ onOpenNotif }: { onOpenNotif: (e: React.MouseEvent) => void }) {
  const toggleSidebar = useWorkbench((s) => s.toggleSidebar)
  const rightOpen = useWorkbench((s) => s.right.open)
  const togglePanel = useWorkbench((s) => s.togglePanel)
  const tabsEnabled = useWorkbench((s) => s.tabsEnabled)
  const activeTab = useWorkbench(selectActiveTab)
  const { identity } = useIdentity()
  const requestCount = useRequestCount()
  const [shareOpen, setShareOpen] = useState(false)

  // Tabless (0353): "what am I looking at" comes from the route + the
  // title the view published, not from an active tab.
  const pathname = useLocation({ select: (location) => location.pathname })
  const routeTitle = useRouteTitle()
  const routed = tabFromPathname(pathname)
  const current = tabsEnabled
    ? activeTab
      ? { nodeType: activeTab.nodeType, nodeId: activeTab.nodeId, title: activeTab.title }
      : null
    : routed
      ? { nodeType: routed.nodeType, nodeId: routed.nodeId, title: routeTitle ?? '' }
      : null

  const shareType = current ? SHARE_TYPES[current.nodeType] : undefined
  const BreadIcon = (current && TAB_ICON[current.nodeType]) ?? FileText

  return (
    <div className="flex h-[50px] shrink-0 items-center gap-2 pl-2 pr-3">
      <button
        type="button"
        onClick={toggleSidebar}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
        className={iconBtn}
      >
        <PanelLeft size={17} strokeWidth={1.75} />
      </button>

      {/* Breadcrumb — the active node's title (ellipsises). */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px]">
        <BreadIcon size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" />
        <span className="truncate font-medium text-ink-1">
          {current?.title || current?.nodeType || 'Workspace'}
        </span>
        {current && (current.nodeType === 'database' || current.nodeType === 'frame') && (
          <OpenWithSelect nodeType={current.nodeType} nodeId={current.nodeId} />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* "You" presence avatar. */}
        {identity && (
          <span className="flex rounded-full ring-2 ring-canvas" title="You">
            <SelfAvatar size={24} />
          </span>
        )}

        {shareType && current && (
          <>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border-none bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Share2 size={15} strokeWidth={1.75} />
              Share
            </button>
            <ShareDialog
              docId={current.nodeId}
              docType={shareType}
              isOpen={shareOpen}
              onClose={() => setShareOpen(false)}
            />
          </>
        )}

        <div className="mx-1 h-[22px] w-px bg-hairline" />

        <button
          type="button"
          onClick={() => togglePanel('right')}
          title="Comments"
          aria-label="Toggle comments"
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg border-none transition-colors ${
            rightOpen
              ? 'bg-accent text-ink-1'
              : 'bg-transparent text-ink-2 hover:bg-background-muted hover:text-ink-1'
          }`}
        >
          <MessageSquare size={17} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onOpenNotif}
          title="Notifications"
          aria-label="Notifications"
          className={`relative ${iconBtn}`}
        >
          <Bell size={17} strokeWidth={1.75} />
          {requestCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full bg-destructive ring-2 ring-canvas" />
          )}
        </button>

        <button type="button" title="More" aria-label="More" className={iconBtn}>
          <MoreHorizontal size={17} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
