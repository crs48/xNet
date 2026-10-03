import type { LibraryGraph, LibraryGraphNode } from '../../../shared/library-graph'
import type { RefObject } from 'react'
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { graphColor } from './model'
import { graphSearchIndex, groupNames, searchGraph } from './navigation'

export function GraphSearch({
  graph,
  inputRef,
  onChoose
}: {
  graph: LibraryGraph | null
  inputRef: RefObject<HTMLInputElement>
  onChoose: (node: LibraryGraphNode) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const search = useDeferredValue(query)
  const index = useMemo(() => (graph ? graphSearchIndex(graph) : []), [graph])
  const results = useMemo(() => searchGraph(index, search), [index, search])
  const pending = query !== search
  const listId = useId()
  const list = useRef<HTMLDivElement>(null)
  const expanded = open && graph !== null
  const selected = Math.min(active, Math.max(0, results.items.length - 1))
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, expanded, results])
  const choose = (node: LibraryGraphNode) => {
    onChoose(node)
    setOpen(false)
  }
  return (
    <div
      className="relative min-w-48 flex-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <input
        ref={inputRef}
        role="combobox"
        aria-label="Search graph"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && !pending && results.items.length ? `${listId}-${selected}` : undefined
        }
        autoComplete="off"
        placeholder="Find a link, tag, category, creator, or playlist…"
        className="w-full rounded-md border border-border bg-background py-2 pl-3 pr-9 text-sm"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && expanded) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            if (!pending)
              setActive(
                expanded
                  ? (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.items.length) %
                      Math.max(1, results.items.length)
                  : event.key === 'ArrowDown'
                    ? 0
                    : Math.max(0, results.items.length - 1)
              )
          } else if (event.key === 'Enter' && expanded && !pending && results.items[selected]) {
            event.preventDefault()
            choose(results.items[selected].node)
          }
        }}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear graph search"
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setQuery('')
            setActive(0)
            inputRef.current?.focus()
          }}
        >
          ×
        </button>
      )}
      {expanded && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-xl">
          <div
            aria-live="polite"
            className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground"
          >
            {search.trim()
              ? `${results.total.toLocaleString()} matches in this view`
              : 'Popular groups in this view'}
            {' · ↑↓ to choose · Enter to navigate'}
          </div>
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label="Graph suggestions"
            aria-busy={pending}
            className="max-h-72 overflow-y-auto p-1"
          >
            {results.items.map(({ node, count }, i) => (
              <button
                key={node.id}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={selected === i}
                tabIndex={-1}
                className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${selected === i ? 'bg-accent' : 'hover:bg-accent'}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => {
                  if (!pending) choose(node)
                }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: graphColor(node.kind, node.platform) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{node.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {node.kind === 'link'
                      ? `${node.platform} · ${node.url ?? 'Saved link'}`
                      : `${groupNames[node.kind]}${node.platform ? ` · ${node.platform}` : ''} · ${count.toLocaleString()} ${count === 1 ? 'link' : 'links'}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {!results.items.length && (
            <p role="status" className="px-3 py-4 text-sm text-muted-foreground">
              No matches in this view. Try fewer words or clear the graph filters.
            </p>
          )}
          {results.total > results.items.length && (
            <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              Showing the best {results.items.length} matches. Keep typing to narrow the list.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
