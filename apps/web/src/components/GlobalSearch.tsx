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
            snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
          } else {
            snippet = text.slice(0, 80) + (text.length > 80 ? '...' : '')
          }

          searchResults.push({
            id,
            title,
            snippet,
            score,
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
        className="search-trigger"
        onClick={() => {
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
        type="button"
      >
        Search... <kbd>&#8984;K</kbd>
      </button>
    )
  }

  return (
    <div className="search-modal-overlay" onClick={() => setIsOpen(false)}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search documents..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="search-input"
          autoComplete="off"
        />

        {loading && <div className="search-loading">Searching...</div>}

        {results.length > 0 && (
          <ul className="search-results">
            {results.map((result, index) => (
              <li
                key={result.id}
                className={`search-result ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <strong className="result-title">{result.title}</strong>
                <p className="result-snippet">{result.snippet}</p>
              </li>
            ))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <div className="search-empty">
            <p>No results found</p>
            <button
              className="create-button"
              onClick={handleCreate}
              type="button"
            >
              Create &ldquo;{query}&rdquo;
            </button>
          </div>
        )}

        <div className="search-footer">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> to navigate</span>
          <span><kbd>Enter</kbd> to select</span>
          <span><kbd>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Extract plain text from XML fragment string
 */
function extractPlainText(xmlStr: string): string {
  return xmlStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
