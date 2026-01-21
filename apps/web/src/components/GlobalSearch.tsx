/**
 * Global search component
 *
 * Provides a Cmd+K searchable dialog for finding documents.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useXNet } from '@xnet/react'
import { useDebouncedCallback } from 'use-debounce'

interface SearchResult {
  id: string
  title: string
  snippet: string
  score: number
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { store, isReady } = useXNet()

  // Keyboard shortcut to open search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        // Focus input after modal opens
        setTimeout(() => inputRef.current?.focus(), 10)
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        setIsOpen(false)
        setQuery('')
        setResults([])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Debounced search function
  const performSearch = useDebouncedCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !isReady) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const state = store.getState()
      const allDocs = state.documents
      const queryLower = searchQuery.toLowerCase()
      const searchResults: SearchResult[] = []

      for (const [id, doc] of Object.entries(allDocs)) {
        const title = doc.metadata?.title || 'Untitled'
        const titleLower = title.toLowerCase()

        // Get content for snippet
        const content = doc.ydoc.getXmlFragment('content')
        const text = extractPlainText(content.toString())
        const textLower = text.toLowerCase()

        // Calculate relevance score
        let score = 0
        if (titleLower.includes(queryLower)) {
          score += 10
          // Bonus for exact match
          if (titleLower === queryLower) score += 5
        }
        if (textLower.includes(queryLower)) {
          score += 5
        }

        if (score > 0) {
          // Extract snippet around first match
          const matchIndex = textLower.indexOf(queryLower)
          let snippet = ''
          if (matchIndex >= 0) {
            const start = Math.max(0, matchIndex - 40)
            const end = Math.min(text.length, matchIndex + queryLower.length + 40)
            snippet =
              (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
          } else {
            snippet = text.slice(0, 80) + (text.length > 80 ? '...' : '')
          }

          searchResults.push({
            id,
            title,
            snippet,
            score
          })
        }
      }

      // Sort by relevance score
      searchResults.sort((a, b) => b.score - a.score)
      setResults(searchResults.slice(0, 10))
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, 200)

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      performSearch(value)
    },
    [performSearch]
  )

  // Handle result selection
  const handleSelect = (result: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    setResults([])
    navigate({ to: '/doc/$docId', params: { docId: result.id } })
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    }
  }

  // Handle creating a new document from search
  const handleCreate = () => {
    if (!query.trim()) return
    const newId = `default/${query.toLowerCase().replace(/\s+/g, '-')}`
    setIsOpen(false)
    setQuery('')
    setResults([])
    navigate({ to: '/doc/$docId', params: { docId: newId } })
  }

  if (!isOpen) {
    return (
      <button
        className="px-4 py-2 border border-border bg-bg-secondary rounded-md cursor-pointer text-sm text-text-secondary flex items-center gap-3 hover:border-text-secondary transition-colors"
        onClick={() => {
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
        type="button"
      >
        Search...{' '}
        <kbd className="text-xs px-1.5 py-0.5 bg-bg rounded border border-border">&#8984;K</kbd>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-bg rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Search documents..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="w-full px-5 py-4 border-none text-lg outline-none bg-transparent text-text placeholder:text-text-secondary"
          autoComplete="off"
        />

        {loading && (
          <div className="px-5 py-4 text-sm text-text-secondary border-t border-border">
            Searching...
          </div>
        )}

        {results.length > 0 && (
          <ul className="list-none max-h-96 overflow-y-auto border-t border-border">
            {results.map((result, index) => (
              <li
                key={result.id}
                className={`px-5 py-3 cursor-pointer border-b border-border last:border-b-0 transition-colors ${
                  index === selectedIndex ? 'bg-bg-secondary' : 'hover:bg-bg-secondary'
                }`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <strong className="block font-medium mb-1">{result.title}</strong>
                <p className="text-sm text-text-secondary m-0 truncate">{result.snippet}</p>
              </li>
            ))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <div className="px-5 py-6 text-center border-t border-border">
            <p className="text-text-secondary mb-3">No results found</p>
            <button
              className="px-4 py-2 bg-primary text-white border-none rounded-md cursor-pointer text-sm hover:bg-primary-hover transition-colors"
              onClick={handleCreate}
              type="button"
            >
              Create &ldquo;{query}&rdquo;
            </button>
          </div>
        )}

        <div className="flex gap-4 justify-center px-5 py-3 border-t border-border text-xs text-text-secondary">
          <span>
            <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-border mr-1">
              &uarr;
            </kbd>
            <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-border mr-1">
              &darr;
            </kbd>
            to navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-border mr-1">
              Enter
            </kbd>
            to select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-border mr-1">
              Esc
            </kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Extract plain text from XML fragment string
 */
function extractPlainText(xmlStr: string): string {
  return xmlStr
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
