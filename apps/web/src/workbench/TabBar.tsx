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
import { getNodeTransfer, hasNodeTransfer, setNodeTransfer } from '@xnetjs/ui'
import { Pin, X } from 'lucide-react'
import { useState } from 'react'
import { navigateToNode } from './navigation'
import { useWorkbench, type EditorGroup, type TabNodeType, type WorkbenchTab } from './state'
import { TAB_VIEWS } from './tabs'

function asTabNodeType(nodeType: string): TabNodeType | null {
  return nodeType in TAB_VIEWS ? (nodeType as TabNodeType) : null
}

function tabDisplayTitle(tab: WorkbenchTab): string {
  return tab.title || TAB_VIEWS[tab.nodeType].label
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
  const Icon = TAB_VIEWS[tab.nodeType].icon

  const activate = () => {
    const state = useWorkbench.getState()
    state.focusGroup(group.id)
    state.activateTab(tab.id, group.id)
    navigateToNode(navigate, tab.nodeType, tab.nodeId)
  }

  const close = () => {
    const state = useWorkbench.getState()
    state.closeTab(tab.id, group.id)
    const next = useWorkbench.getState()
    const nextGroup = next.groups.find((g) => g.id === next.activeGroupId)
    const nextTab = nextGroup?.tabs.find((t) => t.id === nextGroup.activeTabId)
    if (nextTab) {
      navigateToNode(navigate, nextTab.nodeType, nextTab.nodeId)
    } else {
      void navigate({ to: '/' })
    }
  }

  return (
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
      onDragOver={(e) => {
        if (!hasNodeTransfer(e)) return
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        setDropEdge(e.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
      }}
      onDragLeave={() => setDropEdge(null)}
      onDrop={(e) => {
        const transfer = getNodeTransfer(e)
        setDropEdge(null)
        if (!transfer) return
        e.preventDefault()
        e.stopPropagation()
        const state = useWorkbench.getState()
        const index = group.tabs.findIndex((t) => t.id === tab.id) + (dropEdge === 'after' ? 1 : 0)
        if (transfer.sourceContext === 'tab') {
          state.moveTab(`${transfer.nodeType}:${transfer.nodeId}`, group.id, index)
        } else {
          const nodeType = asTabNodeType(transfer.nodeType)
          if (!nodeType) return
          state.openTab({
            nodeId: transfer.nodeId,
            nodeType,
            title: transfer.title,
            groupId: group.id
          })
        }
        const next = useWorkbench.getState()
        const nextGroup = next.groups.find((g) => g.id === next.activeGroupId)
        const nextTab = nextGroup?.tabs.find((t) => t.id === nextGroup.activeTabId)
        if (nextTab) navigateToNode(navigate, nextTab.nodeType, nextTab.nodeId)
      }}
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
      className={`group relative flex h-full max-w-[180px] min-w-0 cursor-pointer select-none items-center gap-1.5 border-r border-hairline px-2.5 text-xs transition-colors ${
        active && routed
          ? 'bg-surface-0 text-ink-1'
          : active
            ? 'bg-surface-0 text-ink-2'
            : 'bg-surface-1 text-ink-2 hover:text-ink-1'
      }`}
    >
      {dropEdge && (
        <span
          className={`absolute top-1 bottom-1 w-0.5 bg-accent-ink ${
            dropEdge === 'before' ? 'left-0' : 'right-0'
          }`}
        />
      )}
      {/* active tab keeps a hairline notch to the editor below */}
      {active && routed && <span className="absolute inset-x-0 top-0 h-px bg-accent-ink" />}
      <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      {!tab.pinned && (
        <span className={`truncate ${tab.preview ? 'italic' : ''}`}>{tabDisplayTitle(tab)}</span>
      )}
      {tab.pinned ? (
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
      ) : (
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
              close()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="hidden cursor-pointer items-center border-none bg-transparent p-0 text-ink-3 hover:text-ink-1 group-hover:flex"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </span>
      )}
    </div>
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
        const state = useWorkbench.getState()
        if (transfer.sourceContext === 'tab') {
          state.moveTab(`${transfer.nodeType}:${transfer.nodeId}`, group.id, group.tabs.length)
        } else {
          const nodeType = asTabNodeType(transfer.nodeType)
          if (!nodeType) return
          state.openTab({
            nodeId: transfer.nodeId,
            nodeType,
            title: transfer.title,
            groupId: group.id
          })
        }
        const next = useWorkbench.getState()
        const nextGroup = next.groups.find((g) => g.id === next.activeGroupId)
        const nextTab = nextGroup?.tabs.find((t) => t.id === nextGroup.activeTabId)
        if (nextTab) navigateToNode(navigate, nextTab.nodeType, nextTab.nodeId)
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
