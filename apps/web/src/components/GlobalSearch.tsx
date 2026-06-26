/**
 * Global search — the universal cmdk palette (exploration 0166).
 *
 * One surface for "find or do anything": quick-open for nodes
 * (recents first), full-text page search, quick task capture, and a
 * `>` prefix for command mode. Every command row shows its chord
 * (passive training). Opens with Cmd+K (or Cmd+P for quick-open);
 * Escape restores the previously focused element.
 */
import type { SearchResult } from '@xnetjs/sdk'
import { useNavigate } from '@tanstack/react-router'
import { CanvasSchema, DashboardSchema, DatabaseSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { getCommandRegistry, type WorkspaceCommand } from '@xnetjs/plugins'
import { useMutate, useQuery } from '@xnetjs/react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@xnetjs/ui'
import { CheckSquare2, CornerDownLeft, FilePlus2, Terminal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePageSearchSurface } from '../hooks/usePageSearchSurface'
import { navigateToNode } from '../workbench/navigation'
import { useWorkbench, type TabNodeType } from '../workbench/state'
import { setPreviewIntent, TAB_VIEWS } from '../workbench/tabs'

function generateTaskId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `task_${globalThis.crypto.randomUUID()}`
  }

  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

interface PaletteNodeItem {
  id: string
  title: string
  type: TabNodeType
}

function NodeRow({
  item,
  onSelect
}: {
  item: PaletteNodeItem
  onSelect: (item: PaletteNodeItem) => void
}) {
  const Icon = TAB_VIEWS[item.type].icon
  return (
    <CommandItem value={`node:${item.type}:${item.id}`} onSelect={() => onSelect(item)}>
      <Icon size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      <span className="flex-1 truncate">{item.title || 'Untitled'}</span>
      <span className="text-[10px] uppercase tracking-wider text-ink-3">
        {TAB_VIEWS[item.type].label}
      </span>
    </CommandItem>
  )
}

function CommandRow({
  command,
  onSelect
}: {
  command: WorkspaceCommand
  onSelect: (command: WorkspaceCommand) => void
}) {
  const registry = getCommandRegistry()
  return (
    <CommandItem value={`command:${command.id}`} onSelect={() => onSelect(command)}>
      <Terminal size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      <span className="flex-1 truncate">{command.title}</span>
      {command.key && <CommandShortcut>{registry.formatForDisplay(command.key)}</CommandShortcut>}
    </CommandItem>
  )
}

function PaletteSection({
  heading,
  count,
  children
}: {
  heading: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return <CommandGroup heading={heading}>{children}</CommandGroup>
}

/**
 * Mounted only while the palette is open, so its queries and search
 * index subscription cost nothing the rest of the time.
 */
function PaletteResults({ query, onClose }: { query: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { create } = useMutate()
  const recents = useWorkbench((state) => state.recents)
  const { search } = usePageSearchSurface({ enabled: true })

  const commandMode = query.startsWith('>')
  const needle = (commandMode ? query.slice(1) : query).trim().toLowerCase()

  const { data: pages } = useQuery(PageSchema, { orderBy: { updatedAt: 'desc' }, limit: 200 })
  const { data: databases } = useQuery(DatabaseSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 200
  })
  const { data: canvases } = useQuery(CanvasSchema, { orderBy: { updatedAt: 'desc' }, limit: 200 })
  const { data: dashboards } = useQuery(DashboardSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 200
  })

  const allNodes = useMemo<PaletteNodeItem[]>(() => {
    const collect = (
      docs: Array<{ id: string; title?: string }> | undefined,
      type: TabNodeType
    ): PaletteNodeItem[] =>
      (docs ?? []).map((doc) => ({ id: doc.id, title: doc.title ?? '', type }))
    return [
      ...collect(pages, 'page'),
      ...collect(databases, 'database'),
      ...collect(canvases, 'canvas'),
      ...collect(dashboards, 'dashboard')
    ]
  }, [pages, databases, canvases, dashboards])

  const fullText = useMemo<SearchResult[]>(() => {
    if (commandMode || !needle) return []
    return search(needle, 8)
  }, [commandMode, needle, search])

  const titleMatches = useMemo<PaletteNodeItem[]>(() => {
    if (commandMode || !needle) return []
    const fullTextIds = new Set(fullText.map((result) => result.id))
    return allNodes
      .filter((node) => !fullTextIds.has(node.id))
      .filter((node) => (node.title || 'untitled').toLowerCase().includes(needle))
      .slice(0, 8)
  }, [commandMode, needle, allNodes, fullText])

  const recentItems = useMemo<PaletteNodeItem[]>(() => {
    if (commandMode || needle) return []
    return recents
      .slice(0, 8)
      .map((recent) => ({ id: recent.nodeId, title: recent.title, type: recent.nodeType }))
  }, [commandMode, needle, recents])

  const commandMatches = useMemo<WorkspaceCommand[]>(() => {
    const registry = getCommandRegistry()
    const available = registry
      .getAvailableCommands()
      .filter((command) => !needle || command.title.toLowerCase().includes(needle))
    return commandMode ? available : available.slice(0, needle ? 3 : 4)
  }, [commandMode, needle])

  const openNode = (item: PaletteNodeItem) => {
    onClose()
    setPreviewIntent()
    navigateToNode(navigate, item.type, item.id)
  }

  const runCommand = (command: WorkspaceCommand) => {
    onClose()
    void getCommandRegistry().runCommand(command.id)
  }

  const createTask = () => {
    const title = (commandMode ? needle : query).trim()
    if (!title) return
    onClose()
    void create(
      TaskSchema,
      { title, completed: false, status: 'todo', source: 'api' },
      generateTaskId()
    ).then(() => navigate({ to: '/tasks' }))
  }

  const createPage = () => {
    const title = query.trim()
    if (!title) return
    onClose()
    const newId = `default/${title.toLowerCase().replace(/\s+/g, '-')}`
    void navigate({ to: '/doc/$docId', params: { docId: newId } })
  }

  return (
    <>
      <CommandEmpty>Nothing found.</CommandEmpty>

      <PaletteSection heading="Recent" count={recentItems.length}>
        {recentItems.map((item) => (
          <NodeRow key={`recent-${item.id}`} item={item} onSelect={openNode} />
        ))}
      </PaletteSection>

      <PaletteSection heading="Pages" count={fullText.length}>
        {fullText.map((result) => (
          <CommandItem
            key={`page-${result.id}`}
            value={`page:${result.id}`}
            onSelect={() => openNode({ id: result.id, title: result.title, type: 'page' })}
          >
            <FilePlus2 size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{result.title}</span>
              <span className="block truncate text-xs text-ink-3">
                {result.snippet || result.title}
              </span>
            </span>
          </CommandItem>
        ))}
      </PaletteSection>

      <PaletteSection heading="Items" count={titleMatches.length}>
        {titleMatches.map((item) => (
          <NodeRow key={`item-${item.id}`} item={item} onSelect={openNode} />
        ))}
      </PaletteSection>

      <PaletteSection heading="Commands" count={commandMatches.length}>
        {commandMatches.map((command) => (
          <CommandRow key={command.id} command={command} onSelect={runCommand} />
        ))}
      </PaletteSection>

      <PaletteSection heading="Create" count={commandMode || !needle ? 0 : 1}>
        <CommandItem value="create:task" onSelect={createTask}>
          <CheckSquare2 size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
          <span className="flex-1 truncate">Create task &ldquo;{query.trim()}&rdquo;</span>
          <CornerDownLeft size={12} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        </CommandItem>
        <CommandItem value="create:page" onSelect={createPage}>
          <FilePlus2 size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
          <span className="flex-1 truncate">Create page &ldquo;{query.trim()}&rdquo;</span>
        </CommandItem>
      </PaletteSection>
    </>
  )
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const open = (initialQuery = '') => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery(initialQuery)
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
    setQuery('')
    restoreFocusRef.current?.focus()
    restoreFocusRef.current = null
  }

  // Cmd+K (palette) and Cmd+P (quick-open) are workspace commands so
  // they appear in shortcut help and can be re-bound centrally.
  useEffect(() => {
    const registry = getCommandRegistry()
    const disposables = [
      registry.register({
        id: 'search.open',
        title: 'Search & commands',
        key: 'Mod-K',
        allowInInput: true,
        run: () => open()
      }),
      registry.register({
        id: 'search.quickOpen',
        title: 'Go to anything',
        key: 'Mod-P',
        allowInInput: true,
        run: () => open()
      }),
      registry.register({
        id: 'search.commands',
        title: 'Run a command…',
        run: () => open('>')
      })
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onMouseDown={close}
    >
      <div className="w-full max-w-xl" onMouseDown={(event) => event.stopPropagation()}>
        <Command
          shouldFilter={false}
          className="glass-surface overflow-hidden rounded-lg border border-hairline bg-popover shadow-soft"
        >
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search, or type > for commands…"
          />
          <CommandList className="max-h-96">
            <PaletteResults query={query} onClose={close} />
          </CommandList>
          <div className="flex justify-center gap-4 border-t border-hairline px-5 py-2 text-[11px] text-ink-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>&gt; commands</span>
            <span>esc close</span>
          </div>
        </Command>
      </div>
    </div>
  )
}
