/**
 * Global search component.
 *
 * Provides a Cmd+K searchable dialog for finding documents.
 */
import type { SearchResult } from '@xnetjs/sdk'
import { useNavigate } from '@tanstack/react-router'
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { usePageSearchSurface } from '../hooks/usePageSearchSurface'

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const deferredQuery = useDeferredValue(query)
  const { indexedPages, loading, search, totalPages } = usePageSearchSurface({ enabled: isOpen })
  const results = useMemo<SearchResult[]>(() => {
    if (!deferredQuery.trim()) return []
    return search(deferredQuery, 10)
  }, [deferredQuery, search])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 10)
      }

      if (event.key === 'Escape' && isOpen) {
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
  }, [results])

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    navigate({ to: '/doc/$docId', params: { docId: result.id } })
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && results[selectedIndex]) {
      event.preventDefault()
      handleSelect(results[selectedIndex])
    }
  }

  const handleCreate = () => {
    if (!query.trim()) return

    const newId = `default/${query.toLowerCase().replace(/\s+/g, '-')}`
    setIsOpen(false)
    setQuery('')
    navigate({ to: '/doc/$docId', params: { docId: newId } })
  }

  if (!isOpen) {
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

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-background rounded-xl shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Search documents..."
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

        {results.length > 0 && (
          <ul className="list-none max-h-96 overflow-y-auto border-t border-border">
            {results.map((result, index) => (
              <li
                key={result.id}
                className={`px-5 py-3 cursor-pointer border-b border-border last:border-b-0 transition-colors ${
                  index === selectedIndex ? 'bg-secondary' : 'hover:bg-secondary'
                }`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <strong className="block font-medium mb-1">{result.title}</strong>
                <p className="text-sm text-muted-foreground m-0 truncate">
                  {result.snippet || result.title}
                </p>
              </li>
            ))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <div className="px-5 py-6 text-center border-t border-border">
            <p className="text-muted-foreground mb-3">No results found</p>
            <button
              className="px-4 py-2 bg-primary text-white border-none rounded-md cursor-pointer text-sm hover:bg-primary-hover transition-colors"
              onClick={handleCreate}
              type="button"
            >
              Create &ldquo;{query}&rdquo;
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
