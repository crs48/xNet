/**
 * Global search component.
 *
 * The unified Cmd+K palette: fuzzy document search, workspace commands
 * from the CommandRegistry (with their keyboard hints), and quick task
 * capture — one keyboard surface for "find or do anything"
 * (exploration 0161, phase 3).
 */
import type { SearchResult } from '@xnetjs/sdk'
import { useNavigate } from '@tanstack/react-router'
import { TaskSchema } from '@xnetjs/data'
import { getCommandRegistry, type WorkspaceCommand } from '@xnetjs/plugins'
import { useMutate } from '@xnetjs/react'
import { CheckSquare2, CornerDownLeft, FileText, Terminal } from 'lucide-react'
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { usePageSearchSurface } from '../hooks/usePageSearchSurface'

type PaletteEntry =
  | { kind: 'command'; command: WorkspaceCommand }
  | { kind: 'page'; result: SearchResult }
  | { kind: 'create-task'; title: string }

function generateTaskId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `task_${globalThis.crypto.randomUUID()}`
  }

  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function GlobalSearch({ trigger = 'button' }: { trigger?: 'button' | 'none' } = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { create } = useMutate()
  const deferredQuery = useDeferredValue(query)
  const { indexedPages, loading, search, totalPages } = usePageSearchSurface({ enabled: isOpen })

  const results = useMemo<SearchResult[]>(() => {
    if (!deferredQuery.trim()) return []
    return search(deferredQuery, 10)
  }, [deferredQuery, search])

  const commandMatches = useMemo<WorkspaceCommand[]>(() => {
    if (!isOpen) return []
    const registry = getCommandRegistry()
    const needle = deferredQuery.trim().toLowerCase()
    return registry
      .getAvailableCommands()
      .filter((command) => !needle || command.title.toLowerCase().includes(needle))
      .slice(0, needle ? 5 : 4)
  }, [isOpen, deferredQuery])

  const entries = useMemo<PaletteEntry[]>(() => {
    const list: PaletteEntry[] = commandMatches.map((command) => ({ kind: 'command', command }))
    for (const result of results) list.push({ kind: 'page', result })
    if (deferredQuery.trim()) {
      list.push({ kind: 'create-task', title: deferredQuery.trim() })
    }
    return list
  }, [commandMatches, results, deferredQuery])

  // Cmd+K is a workspace command so it appears in the shortcut help and
  // can be re-bound centrally; allowInInput keeps it reachable mid-edit.
  useEffect(() => {
    const registry = getCommandRegistry()
    const disposable = registry.register({
      id: 'search.open',
      title: 'Search & commands',
      key: 'Mod-K',
      allowInInput: true,
      run: () => {
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 10)
      }
    })

    return () => disposable.dispose()
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        setQuery('')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [entries.length])

  const close = () => {
    setIsOpen(false)
    setQuery('')
  }

  const handleSelect = (entry: PaletteEntry) => {
    if (entry.kind === 'command') {
      close()
      void getCommandRegistry().runCommand(entry.command.id)
      return
    }

    if (entry.kind === 'page') {
      close()
      navigate({ to: '/doc/$docId', params: { docId: entry.result.id } })
      return
    }

    close()
    void create(
      TaskSchema,
      { title: entry.title, completed: false, status: 'todo', source: 'api' },
      generateTaskId()
    ).then(() => navigate({ to: '/tasks' }))
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((index) => Math.min(index + 1, entries.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && entries[selectedIndex]) {
      event.preventDefault()
      handleSelect(entries[selectedIndex])
    }
  }

  const handleCreatePage = () => {
    if (!query.trim()) return

    const newId = `default/${query.toLowerCase().replace(/\s+/g, '-')}`
    close()
    navigate({ to: '/doc/$docId', params: { docId: newId } })
  }

  if (!isOpen) {
    if (trigger === 'none') return null
    return (
      <button
        className="px-4 py-2 border border-border bg-secondary rounded-md cursor-pointer text-sm text-muted-foreground flex items-center gap-3 hover:border-muted-foreground transition-colors"
        onClick={() => {
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
        type="button"
      >
        Search...{' '}
        <kbd className="text-xs px-1.5 py-0.5 bg-background rounded border border-border">
          &#8984;K
        </kbd>
      </button>
    )
  }

  const registry = getCommandRegistry()

  const renderEntry = (entry: PaletteEntry, index: number) => {
    const isSelected = index === selectedIndex
    const baseClass = `flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
      isSelected ? 'bg-secondary' : 'hover:bg-secondary'
    }`

    if (entry.kind === 'command') {
      return (
        <li
          key={`command-${entry.command.id}`}
          className={baseClass}
          onClick={() => handleSelect(entry)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <Terminal size={14} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm text-foreground">{entry.command.title}</span>
          {entry.command.key && (
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
              {registry.formatForDisplay(entry.command.key)}
            </kbd>
          )}
        </li>
      )
    }

    if (entry.kind === 'page') {
      return (
        <li
          key={`page-${entry.result.id}`}
          className={baseClass}
          onClick={() => handleSelect(entry)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <FileText size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-medium text-foreground">
              {entry.result.title}
            </strong>
            <span className="block truncate text-xs text-muted-foreground">
              {entry.result.snippet || entry.result.title}
            </span>
          </span>
        </li>
      )
    }

    return (
      <li
        key="create-task"
        className={baseClass}
        onClick={() => handleSelect(entry)}
        onMouseEnter={() => setSelectedIndex(index)}
      >
        <CheckSquare2 size={14} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm text-foreground">
          Create task &ldquo;{entry.title}&rdquo;
        </span>
        <CornerDownLeft size={12} className="shrink-0 text-muted-foreground" />
      </li>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50"
      onClick={close}
    >
      <div
        className="w-full max-w-xl bg-background rounded-xl shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Search or run a command..."
          value={query}
          onChange={(event) => {
            const value = event.target.value
            startTransition(() => {
              setQuery(value)
            })
          }}
          onKeyDown={handleKeyDown}
          className="w-full px-5 py-4 border-none text-lg outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
          autoComplete="off"
        />

        {loading && (
          <div className="px-5 py-4 text-sm text-muted-foreground border-t border-border">
            Indexing pages... {indexedPages}/{totalPages}
          </div>
        )}

        {entries.length > 0 && (
          <ul className="list-none max-h-96 overflow-y-auto border-t border-border">
            {entries.map((entry, index) => renderEntry(entry, index))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <div className="px-5 py-3 text-center border-t border-border">
            <button
              className="px-4 py-2 bg-primary text-white border-none rounded-md cursor-pointer text-sm hover:bg-primary-hover transition-colors"
              onClick={handleCreatePage}
              type="button"
            >
              Create page &ldquo;{query}&rdquo;
            </button>
          </div>
        )}

        <div className="flex gap-4 justify-center px-5 py-3 border-t border-border text-xs text-muted-foreground">
          <span>
            <kbd className="px-1.5 py-0.5 bg-secondary rounded border border-border mr-1">
              &uarr;
            </kbd>
            <kbd className="px-1.5 py-0.5 bg-secondary rounded border border-border mr-1">
              &darr;
            </kbd>
            to navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-secondary rounded border border-border mr-1">
              Enter
            </kbd>
            to select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-secondary rounded border border-border mr-1">Esc</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  )
}
