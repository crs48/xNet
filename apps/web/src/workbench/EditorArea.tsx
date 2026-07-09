/**
 * EditorArea — the tabbed, splittable center region (exploration 0166).
 *
 * The router stays authoritative: the active group renders the router
 * outlet, and a route effect reconciles the tab store against the URL
 * (open-or-activate). The second group of a split direct-mounts its
 * view through ViewHost. Background tabs are unmounted entirely — no
 * live Y.Doc subscriptions.
 */
import { useLocation, useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { ErrorBoundary } from '@xnetjs/react'
import { getNodeTransfer, hasNodeTransfer } from '@xnetjs/ui'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Group, Panel } from 'react-resizable-panels'
import { ErrorFallback } from '../components/ErrorFallback'
import { navigateToNewDoc, type NavigateLike } from '../lib/doc-creation'
import { Hairline } from './Hairline'
import { navigateToNode } from './navigation'
import {
  useWorkbench,
  tabIdFor,
  type EditorGroup,
  type TabNodeType,
  type WorkbenchTab
} from './state'
import { TabBar, type TabVariant } from './TabBar'
import { TabBreadcrumb } from './TabBreadcrumb'
import { syncRouteToTabs, tabFromPathname, TAB_VIEWS } from './tabs'
import { ViewHost } from './ViewHost'

type Navigate = ReturnType<typeof useNavigate>

/** Open-or-activate the tab for the current route (router → store). */
function useRouteTabSync(pathname: string): void {
  useEffect(() => syncRouteToTabs(pathname), [pathname])
}

function useTabCommands(navigate: Navigate): void {
  useEffect(() => {
    const registry = getCommandRegistry()
    const wb = () => useWorkbench.getState()

    const navigateToActive = () => {
      const state = useWorkbench.getState()
      const group = state.groups.find((g) => g.id === state.activeGroupId)
      const tab = group?.tabs.find((t) => t.id === group.activeTabId)
      if (tab) {
        navigateToNode(navigate, tab.nodeType, tab.nodeId)
      } else {
        void navigate({ to: '/' })
      }
    }

    const focusGroupAt = (index: number) => {
      const state = wb()
      const group = state.groups[index]
      if (!group) return
      state.focusGroup(group.id)
      navigateToActive()
    }

    const disposables = [
      registry.register({
        id: 'workbench.newPage',
        title: 'New page',
        key: 'Mod-T',
        allowInInput: true,
        run: () => navigateToNewDoc(navigate as unknown as NavigateLike, 'page')
      }),
      registry.register({
        id: 'workbench.closeTab',
        title: 'Close tab',
        key: 'Mod-W',
        allowInInput: true,
        run: () => {
          const state = wb()
          const group = state.groups.find((g) => g.id === state.activeGroupId)
          if (!group?.activeTabId) return
          state.closeTab(group.activeTabId, group.id)
          navigateToActive()
        }
      }),
      registry.register({
        id: 'workbench.nextTab',
        title: 'Next tab',
        key: 'Ctrl-Tab',
        allowInInput: true,
        run: () => {
          wb().cycleTab(1)
          navigateToActive()
        }
      }),
      registry.register({
        id: 'workbench.previousTab',
        title: 'Previous tab',
        key: 'Ctrl-Shift-Tab',
        allowInInput: true,
        run: () => {
          wb().cycleTab(-1)
          navigateToActive()
        }
      }),
      registry.register({
        id: 'workbench.focusGroup1',
        title: 'Focus first editor group',
        key: 'Mod-1',
        allowInInput: true,
        run: () => focusGroupAt(0)
      }),
      registry.register({
        id: 'workbench.focusGroup2',
        title: 'Focus second editor group',
        key: 'Mod-2',
        allowInInput: true,
        run: () => focusGroupAt(1)
      }),
      registry.register({
        id: 'workbench.splitEditor',
        title: 'Split editor',
        // Cmd+Shift+\ — printable keys carry shift implicitly, so the
        // binding is the shifted character itself.
        key: 'Mod-|',
        allowInInput: true,
        when: () => {
          const state = useWorkbench.getState()
          const group = state.groups.find((g) => g.id === state.activeGroupId)
          return Boolean(group?.activeTabId)
        },
        run: () => {
          const state = wb()
          const group = state.groups.find((g) => g.id === state.activeGroupId)
          const tab = group?.tabs.find((t) => t.id === group.activeTabId)
          if (!tab) return
          state.splitWith({ nodeId: tab.nodeId, nodeType: tab.nodeType, title: tab.title })
        }
      })
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
  }, [navigate])
}

function GroupTabStrip({
  mode,
  group,
  routed,
  tabVariant
}: {
  mode: string
  group: EditorGroup
  routed: boolean
  tabVariant: TabVariant
}) {
  if (mode === 'zen' || group.tabs.length === 0) return null
  return <TabBar group={group} routed={routed} variant={tabVariant} />
}

function ActiveGroupOutlet({
  activeTab,
  routed,
  children
}: {
  activeTab: WorkbenchTab | null
  routed: boolean
  children: ReactNode
}) {
  // Pages are full-bleed documents that own their scroll; other
  // views render inside the default padded scroll container.
  const fullBleed = routed && activeTab?.nodeType === 'page'
  return (
    <main className={`h-full min-h-0 ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto p-6'}`}>
      {children}
    </main>
  )
}

function GroupContent({
  isActive,
  activeTab,
  routed,
  children
}: {
  isActive: boolean
  activeTab: WorkbenchTab | null
  routed: boolean
  children: ReactNode
}) {
  if (isActive) {
    return (
      <ActiveGroupOutlet activeTab={activeTab} routed={routed}>
        {children}
      </ActiveGroupOutlet>
    )
  }
  if (activeTab) {
    return <ViewHost tab={activeTab} />
  }
  return null
}

function GroupPane({
  group,
  isActive,
  routed,
  tabVariant,
  children
}: {
  group: EditorGroup
  isActive: boolean
  routed: boolean
  tabVariant: TabVariant
  children: ReactNode
}) {
  const navigate = useNavigate()
  const mode = useWorkbench((state) => state.mode)
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId) ?? null

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${tabVariant === 'pill' ? 'bg-canvas' : 'bg-surface-0'}`}
      onMouseDownCapture={() => {
        if (isActive) return
        const state = useWorkbench.getState()
        state.focusGroup(group.id)
        const tab = group.tabs.find((t) => t.id === group.activeTabId)
        if (tab) navigateToNode(navigate, tab.nodeType, tab.nodeId)
      }}
    >
      <GroupTabStrip mode={mode} group={group} routed={routed} tabVariant={tabVariant} />
      {/* The floating shell (pill) carries the breadcrumb in its editor header. */}
      {mode !== 'zen' && tabVariant !== 'pill' && <TabBreadcrumb tab={activeTab} />}
      <div className="min-h-0 flex-1">
        <GroupContent isActive={isActive} activeTab={activeTab} routed={routed}>
          {children}
        </GroupContent>
      </div>
    </div>
  )
}

/**
 * Starter chips (0280 phase 4, the 0273 empty-state pattern): three dimmed
 * affordances on a tabless bench that vanish after the first real tab —
 * paralysis mitigation without clutter. Each chip runs the same command
 * its chord and palette entry run.
 */
function StarterChips() {
  const chips = [
    { id: 'workbench.newPage', label: 'New page', hint: '⌘T' },
    { id: 'workbench.toggleLeftPanel', label: 'Open navigator', hint: '⌘B' },
    { id: 'search.open', label: 'Command palette', hint: '⌘K' }
  ]
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => void getCommandRegistry().runCommand(chip.id)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-transparent px-3 py-1 text-xs text-ink-3 transition-colors hover:text-ink-1"
        >
          {chip.label}
          <span className="text-[10px] text-ink-3/70">{chip.hint}</span>
        </button>
      ))}
    </div>
  )
}

export function EditorArea({
  children,
  tabVariant = 'strip'
}: {
  children: ReactNode
  tabVariant?: TabVariant
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const groups = useWorkbench((state) => state.groups)
  const activeGroupId = useWorkbench((state) => state.activeGroupId)
  const [dragDepth, setDragDepth] = useState(0)

  useRouteTabSync(location.pathname)
  useTabCommands(navigate)

  // Clear the split-drop affordance when any drag ends.
  useEffect(() => {
    const clear = () => setDragDepth(0)
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [])

  const routedDescriptor = tabFromPathname(location.pathname)
  const routedTabId = routedDescriptor
    ? tabIdFor(routedDescriptor.nodeType, routedDescriptor.nodeId)
    : null

  const totalTabs = groups.reduce((count, group) => count + group.tabs.length, 0)

  const outlet = (
    <ErrorBoundary
      resetKey={location.pathname}
      fallback={({ error, reset }) => <ErrorFallback error={error} reset={reset} />}
    >
      {children}
    </ErrorBoundary>
  )

  return (
    <div
      data-wb-region="editor"
      className="relative flex h-full min-h-0 flex-col bg-surface-0"
      onDragEnter={(e) => {
        if (hasNodeTransfer(e)) setDragDepth((depth) => depth + 1)
      }}
      onDragLeave={(e) => {
        if (hasNodeTransfer(e)) setDragDepth((depth) => Math.max(0, depth - 1))
      }}
    >
      {totalTabs === 0 && <StarterChips />}
      <Group orientation="horizontal" id="xnet-wb-editor-groups">
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <Hairline orientation="horizontal" id={`sep-${group.id}`} />}
            <Panel id={group.id} minSize="20%">
              <GroupPane
                group={group}
                isActive={group.id === activeGroupId}
                routed={group.id === activeGroupId && group.activeTabId === routedTabId}
                tabVariant={tabVariant}
              >
                {outlet}
              </GroupPane>
            </Panel>
          </Fragment>
        ))}
      </Group>

      {/* Drag-to-edge split affordance */}
      {dragDepth > 0 && groups.length < 2 && (
        <div
          className="absolute inset-y-0 right-0 z-10 w-16 border-l border-dashed border-border-emphasis bg-surface-2/80 transition-colors"
          onDragOver={(e) => {
            if (hasNodeTransfer(e)) e.preventDefault()
          }}
          onDrop={(e) => {
            const transfer = getNodeTransfer(e)
            setDragDepth(0)
            if (!transfer || !(transfer.nodeType in TAB_VIEWS)) return
            e.preventDefault()
            e.stopPropagation()
            useWorkbench.getState().splitWith({
              nodeId: transfer.nodeId,
              nodeType: transfer.nodeType as TabNodeType,
              title: transfer.title
            })
            navigateToNode(navigate, transfer.nodeType as TabNodeType, transfer.nodeId)
          }}
        />
      )}
    </div>
  )
}
