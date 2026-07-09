/**
 * TabBar — one editor group's tab strip (exploration 0166).
 *
 * Single click activates, double click promotes a preview tab,
 * middle click closes, drag reorders (or moves between groups), and
 * dropping any node transfer onto the strip opens it as a tab.
 * Preview tabs render italic; pinned tabs shrink to their icon and
 * lose the close button.
 */
import { useNavigate } from '@tanstack/react-router'
import {
  ActionMenuList,
  ContextMenu,
  getNodeTransfer,
  hasNodeTransfer,
  setNodeTransfer,
  type Action,
  type NodeTransfer
} from '@xnetjs/ui'
import {
  ArrowRightFromLine,
  FileText,
  Pin,
  PinOff,
  SplitSquareHorizontal,
  X,
  XSquare
} from 'lucide-react'
import { createElement, useState } from 'react'
import { navigateToNode } from './navigation'
import { useWorkbench, type EditorGroup, type TabNodeType, type WorkbenchTab } from './state'
import { TAB_VIEWS } from './tabs'

type Navigate = ReturnType<typeof useNavigate>

function tabDisplayTitle(tab: WorkbenchTab): string {
  return tab.title || TAB_VIEWS[tab.nodeType].label
}

function asTabNodeType(nodeType: string): TabNodeType | null {
  return nodeType in TAB_VIEWS ? (nodeType as TabNodeType) : null
}

/** Route to the active tab of the active group (or home when none). */
function navigateToActiveTab(navigate: Navigate): void {
  const state = useWorkbench.getState()
  const group = state.groups.find((g) => g.id === state.activeGroupId)
  const tab = group?.tabs.find((t) => t.id === group.activeTabId)
  if (tab) {
    navigateToNode(navigate, tab.nodeType, tab.nodeId, { preview: false })
  } else {
    void navigate({ to: '/' })
  }
}

/** Move (tab source) or open (any other source) a transfer in a group. */
function dropTransferOnGroup(
  navigate: Navigate,
  transfer: NodeTransfer,
  groupId: string,
  index: number
): void {
  const state = useWorkbench.getState()
  if (transfer.sourceContext === 'tab') {
    state.moveTab(`${transfer.nodeType}:${transfer.nodeId}`, groupId, index)
  } else {
    const nodeType = asTabNodeType(transfer.nodeType)
    if (!nodeType) return
    state.openTab({ nodeId: transfer.nodeId, nodeType, title: transfer.title, groupId })
  }
  navigateToActiveTab(navigate)
}

function tabItemClassName(active: boolean, routed: boolean): string {
  const base =
    'group relative flex h-full max-w-[180px] min-w-0 cursor-pointer select-none items-center gap-1.5 border-r border-hairline px-2.5 text-xs transition-colors'
  if (active && routed) return `${base} bg-surface-0 text-ink-1`
  if (active) return `${base} bg-surface-0 text-ink-2`
  return `${base} bg-surface-1 text-ink-2 hover:text-ink-1`
}

function TabDropIndicator({ dropEdge }: { dropEdge: 'before' | 'after' | null }) {
  if (!dropEdge) return null
  return (
    <span
      className={`absolute top-1 bottom-1 w-0.5 bg-accent-ink ${
        dropEdge === 'before' ? 'left-0' : 'right-0'
      }`}
    />
  )
}

function TabLabel({ tab }: { tab: WorkbenchTab }) {
  if (tab.pinned) return null
  return (
    <span className={tab.preview ? 'truncate italic' : 'truncate'}>{tabDisplayTitle(tab)}</span>
  )
}

function TabActions({ tab, onClose }: { tab: WorkbenchTab; onClose: () => void }) {
  if (tab.pinned) {
    return (
      <button
        type="button"
        title="Unpin tab"
        aria-label="Unpin tab"
        onClick={(e) => {
          e.stopPropagation()
          useWorkbench.getState().setTabPinned(tab.id, false)
        }}
        className="flex cursor-pointer items-center border-none bg-transparent p-0 text-ink-3 hover:text-ink-1"
      >
        <Pin size={11} className="fill-current" />
      </button>
    )
  }

  return (
    <span className="flex w-[26px] shrink-0 items-center justify-end gap-0.5">
      <button
        type="button"
        title="Pin tab"
        aria-label="Pin tab"
        onClick={(e) => {
          e.stopPropagation()
          useWorkbench.getState().setTabPinned(tab.id, true)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="hidden cursor-pointer items-center border-none bg-transparent p-0 text-ink-3 hover:text-ink-1 group-hover:flex"
      >
        <Pin size={11} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        title="Close tab (⌘W)"
        aria-label="Close tab"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="hidden cursor-pointer items-center border-none bg-transparent p-0 text-ink-3 hover:text-ink-1 group-hover:flex"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </span>
  )
}

function TabItem({
  tab,
  group,
  active,
  routed
}: {
  tab: WorkbenchTab
  group: EditorGroup
  active: boolean
  routed: boolean
}) {
  const navigate = useNavigate()
  const [dropEdge, setDropEdge] = useState<'before' | 'after' | null>(null)
  // Defensive: a tab persisted by a newer/other build must render, not crash.
  const Icon = TAB_VIEWS[tab.nodeType]?.icon ?? FileText

  const activate = () => {
    const state = useWorkbench.getState()
    state.focusGroup(group.id)
    state.activateTab(tab.id, group.id)
    navigateToNode(navigate, tab.nodeType, tab.nodeId, { preview: false })
  }

  const close = () => {
    useWorkbench.getState().closeTab(tab.id, group.id)
    navigateToActiveTab(navigate)
  }

  const handleDrop = (e: React.DragEvent) => {
    const transfer = getNodeTransfer(e)
    setDropEdge(null)
    if (!transfer) return
    e.preventDefault()
    e.stopPropagation()
    const index = group.tabs.findIndex((t) => t.id === tab.id) + (dropEdge === 'after' ? 1 : 0)
    dropTransferOnGroup(navigate, transfer, group.id, index)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasNodeTransfer(e)) return
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setDropEdge(e.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
  }

  const closeMany = (predicate: (t: WorkbenchTab, index: number) => boolean) => {
    const state = useWorkbench.getState()
    for (const [index, t] of group.tabs.entries()) {
      if (!t.pinned && predicate(t, index)) state.closeTab(t.id, group.id)
    }
    navigateToActiveTab(navigate)
  }

  const selfIndex = group.tabs.findIndex((t) => t.id === tab.id)
  const closableOthers = group.tabs.some((t) => t.id !== tab.id && !t.pinned)
  const closableRight = group.tabs.some((t, i) => i > selfIndex && !t.pinned)

  const actions: Action[] = [
    {
      id: 'close',
      label: 'Close',
      icon: createElement(X, { size: 14 }),
      shortcut: '⌘W',
      when: () => !tab.pinned,
      run: close
    },
    {
      id: 'close-others',
      label: 'Close others',
      icon: createElement(XSquare, { size: 14 }),
      when: () => closableOthers,
      run: () => closeMany((t) => t.id !== tab.id)
    },
    {
      id: 'close-right',
      label: 'Close to the right',
      icon: createElement(ArrowRightFromLine, { size: 14 }),
      when: () => closableRight,
      run: () => closeMany((_t, index) => index > selfIndex)
    },
    { id: '---' },
    {
      id: 'pin',
      label: tab.pinned ? 'Unpin tab' : 'Pin tab',
      icon: createElement(tab.pinned ? PinOff : Pin, { size: 14 }),
      run: () => useWorkbench.getState().setTabPinned(tab.id, !tab.pinned)
    },
    {
      id: 'split',
      label: 'Open in split',
      icon: createElement(SplitSquareHorizontal, { size: 14 }),
      run: () =>
        useWorkbench
          .getState()
          .splitWith({ nodeId: tab.nodeId, nodeType: tab.nodeType, title: tab.title })
    }
  ]

  return (
    <ContextMenu className="contents" menu={<ActionMenuList actions={actions} />}>
      <div
        role="tab"
        aria-selected={active && routed}
        data-tab-id={tab.id}
        draggable
        onDragStart={(e) => {
          setNodeTransfer(e, {
            nodeId: tab.nodeId,
            nodeType: tab.nodeType,
            title: tab.title,
            sourceContext: 'tab'
          })
          e.dataTransfer.effectAllowed = 'copyMove'
        }}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropEdge(null)}
        onDrop={handleDrop}
        onMouseDown={(e) => {
          if (e.button === 0) activate()
        }}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault()
            close()
          }
        }}
        onDoubleClick={() => useWorkbench.getState().promoteTab(tab.id)}
        className={tabItemClassName(active, routed)}
      >
        <TabDropIndicator dropEdge={dropEdge} />
        {/* active tab keeps a hairline notch to the editor below */}
        {active && routed && <span className="absolute inset-x-0 top-0 h-px bg-accent-ink" />}
        <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <TabLabel tab={tab} />
        <TabActions tab={tab} onClose={close} />
      </div>
    </ContextMenu>
  )
}

export function TabBar({ group, routed }: { group: EditorGroup; routed: boolean }) {
  const navigate = useNavigate()

  return (
    <div
      role="tablist"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-hairline bg-surface-1"
      onDragOver={(e) => {
        if (hasNodeTransfer(e)) e.preventDefault()
      }}
      onDrop={(e) => {
        const transfer = getNodeTransfer(e)
        if (!transfer) return
        e.preventDefault()
        dropTransferOnGroup(navigate, transfer, group.id, group.tabs.length)
      }}
    >
      {group.tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          group={group}
          active={tab.id === group.activeTabId}
          routed={routed}
        />
      ))}
      <div className="min-w-4 flex-1" />
    </div>
  )
}
