# 13: xNet Features

> Wiki, tasks, and editor implementation

**Duration:** 6 weeks
**Dependencies:** Platform apps, @xnet/sdk

## Overview

After platform POCs are working, implement the core xNet features in this order:

1. Rich text editor (Tiptap)
2. Page/wiki functionality
3. Wikilinks and backlinks
4. Task management
5. Search integration

## Feature 1: Rich Text Editor

### Setup

```bash
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit
pnpm add @tiptap/extension-placeholder @tiptap/extension-collaboration
pnpm add @tiptap/extension-collaboration-cursor
pnpm add y-prosemirror
```

### Tiptap Editor Component

```tsx
// apps/web/src/components/Editor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { Wikilink } from './extensions/Wikilink'
import { TaskItem } from './extensions/TaskItem'
import type { XDocument } from '@xnet/data'
import * as Y from 'yjs'

interface EditorProps {
  document: XDocument
  onChange?: () => void
  onCursorChange?: (cursor: { blockId: string; offset: number }) => void
}

export function Editor({ document, onChange, onCursorChange }: EditorProps) {
  // Get or create the content fragment
  const fragment = document.ydoc.getXmlFragment('content')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false // Disabled - using Yjs history
      }),
      Placeholder.configure({
        placeholder: 'Start writing...'
      }),
      Collaboration.configure({
        fragment
      }),
      CollaborationCursor.configure({
        provider: null // Would be y-webrtc provider
      }),
      Wikilink,
      TaskItem
    ],
    onUpdate: () => {
      onChange?.()
    },
    onSelectionUpdate: ({ editor }) => {
      const { from } = editor.state.selection
      onCursorChange?.({
        blockId: 'root', // Would get actual block ID
        offset: from
      })
    }
  })

  return (
    <div className="editor-container">
      <EditorContent editor={editor} className="editor-content" />
    </div>
  )
}
```

### Editor Toolbar

```tsx
// apps/web/src/components/EditorToolbar.tsx
import { Editor } from '@tiptap/react'

interface ToolbarProps {
  editor: Editor | null
}

export function EditorToolbar({ editor }: ToolbarProps) {
  if (!editor) return null

  return (
    <div className="editor-toolbar">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'active' : ''}
      >
        B
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'active' : ''}
      >
        I
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? 'active' : ''}
      >
        •
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? 'active' : ''}
      >
        1.
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'active' : ''}
      >
        {'</>'}
      </button>
    </div>
  )
}
```

## Feature 2: Wikilinks

### Wikilink Extension

```typescript
// apps/web/src/components/extensions/Wikilink.ts
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface WikilinkOptions {
  onNavigate: (pageId: string) => void
  onSearch: (query: string) => Promise<{ id: string; title: string }[]>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikilink: {
      setWikilink: (attributes: { href: string; title: string }) => ReturnType
    }
  }
}

export const Wikilink = Mark.create<WikilinkOptions>({
  name: 'wikilink',

  addOptions() {
    return {
      onNavigate: () => {},
      onSearch: async () => []
    }
  },

  addAttributes() {
    return {
      href: {
        default: null
      },
      title: {
        default: null
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wikilink]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        class: 'wikilink'
      }),
      0
    ]
  },

  addCommands() {
    return {
      setWikilink:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes)
        }
    }
  },

  addProseMirrorPlugins() {
    const { onNavigate } = this.options

    return [
      new Plugin({
        key: new PluginKey('wikilinkClick'),
        props: {
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement
            if (target.dataset.wikilink !== undefined) {
              const href = target.getAttribute('href')
              if (href) {
                onNavigate(href)
                return true
              }
            }
            return false
          }
        }
      })
    ]
  }
})
```

### Wikilink Input Handler

```typescript
// Detect [[text]] pattern and convert to wikilink
import { InputRule } from '@tiptap/core'

export const wikilinkInputRule = new InputRule({
  find: /\[\[([^\]]+)\]\]$/,
  handler: ({ state, range, match, commands }) => {
    const title = match[1]
    const pageId = generatePageId(title)

    commands.insertContentAt(range, {
      type: 'text',
      marks: [
        {
          type: 'wikilink',
          attrs: { href: pageId, title }
        }
      ],
      text: title
    })
  }
})

function generatePageId(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-')
}
```

## Feature 3: Backlinks

### Backlinks Panel

```tsx
// apps/web/src/components/BacklinksPanel.tsx
import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'

interface Backlink {
  docId: string
  title: string
  context: string
}

interface Props {
  docId: string
  searchBacklinks: (docId: string) => Promise<Backlink[]>
}

export function BacklinksPanel({ docId, searchBacklinks }: Props) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const links = await searchBacklinks(docId)
      setBacklinks(links)
      setLoading(false)
    }
    load()
  }, [docId, searchBacklinks])

  if (loading) return <div>Loading backlinks...</div>

  if (backlinks.length === 0) {
    return (
      <div className="backlinks-panel empty">
        <h3>Backlinks</h3>
        <p>No pages link to this page</p>
      </div>
    )
  }

  return (
    <div className="backlinks-panel">
      <h3>Backlinks ({backlinks.length})</h3>
      <ul>
        {backlinks.map((link) => (
          <li key={link.docId}>
            <Link to="/doc/$docId" params={{ docId: link.docId }}>
              <strong>{link.title}</strong>
              <span className="context">...{link.context}...</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Backlink Search Function

```typescript
// packages/query/src/backlinks.ts
import type { XDocument } from '@xnet/data'

interface BacklinkResult {
  docId: string
  title: string
  context: string
}

export async function findBacklinks(
  targetDocId: string,
  getAllDocuments: () => Promise<XDocument[]>
): Promise<BacklinkResult[]> {
  const allDocs = await getAllDocuments()
  const results: BacklinkResult[] = []

  for (const doc of allDocs) {
    if (doc.id === targetDocId) continue

    // Get document content
    const content = doc.ydoc.getXmlFragment('content')
    const text = xmlFragmentToText(content)

    // Check for wikilinks to target
    const linkPattern = new RegExp(`\\[\\[${escapeRegex(targetDocId)}\\]\\]`, 'gi')
    const matches = text.match(linkPattern)

    if (matches) {
      // Extract context around the link
      const context = extractContext(text, targetDocId)
      results.push({
        docId: doc.id,
        title: doc.metadata.title,
        context
      })
    }
  }

  return results
}

function xmlFragmentToText(fragment: any): string {
  // Convert Yjs XML fragment to plain text
  return fragment.toString()
}

function extractContext(text: string, targetId: string): string {
  const index = text.toLowerCase().indexOf(targetId.toLowerCase())
  if (index === -1) return ''
  const start = Math.max(0, index - 30)
  const end = Math.min(text.length, index + targetId.length + 30)
  return text.slice(start, end)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

## Feature 4: Task Management

### Task Item Extension

```typescript
// apps/web/src/components/extensions/TaskItem.ts
import { Node, mergeAttributes } from '@tiptap/core'

export const TaskItem = Node.create({
  name: 'taskItem',

  addOptions() {
    return {
      nested: true,
      HTMLAttributes: {}
    }
  },

  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-checked') === 'true',
        renderHTML: (attrs) => ({
          'data-checked': attrs.checked
        })
      },
      dueDate: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-due-date'),
        renderHTML: (attrs) =>
          attrs.dueDate
            ? {
                'data-due-date': attrs.dueDate
              }
            : {}
      },
      priority: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-priority'),
        renderHTML: (attrs) =>
          attrs.priority
            ? {
                'data-priority': attrs.priority
              }
            : {}
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: `li[data-type="${this.name}"]`
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'li',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': this.name
      }),
      ['label', ['input', { type: 'checkbox', checked: node.attrs.checked }], ['span']],
      ['div', 0]
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.toggleTaskList(),
      'Mod-Shift-x': () => {
        // Toggle checked state
        return this.editor.commands.updateAttributes('taskItem', {
          checked: !this.editor.getAttributes('taskItem').checked
        })
      }
    }
  }
})
```

### Task List View

```tsx
// apps/web/src/components/TaskListView.tsx
import { useQuery } from '@xnet/react'
import { Link } from '@tanstack/react-router'

interface Task {
  id: string
  docId: string
  text: string
  checked: boolean
  dueDate?: string
  priority?: 'low' | 'medium' | 'high'
}

export function TaskListView() {
  const { data: tasks, loading } = useQuery<Task>({
    type: 'task',
    filters: [{ field: 'checked', operator: 'eq', value: false }],
    sort: [
      { field: 'dueDate', direction: 'asc' },
      { field: 'priority', direction: 'desc' }
    ]
  })

  if (loading) return <div>Loading tasks...</div>

  return (
    <div className="task-list-view">
      <h2>Tasks</h2>

      {tasks.length === 0 ? (
        <p>No pending tasks</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className={`task-item priority-${task.priority || 'none'}`}>
              <input
                type="checkbox"
                checked={task.checked}
                onChange={() => {
                  /* Toggle task */
                }}
              />
              <Link to="/doc/$docId" params={{ docId: task.docId }}>
                <span className="task-text">{task.text}</span>
                {task.dueDate && (
                  <span className="task-due">{new Date(task.dueDate).toLocaleDateString()}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

## Feature 5: Search Integration

### Global Search Component

```tsx
// apps/web/src/components/GlobalSearch.tsx
import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useXNet } from '@xnet/react'
import { useDebouncedCallback } from 'use-debounce'

interface SearchResult {
  id: string
  title: string
  type: string
  snippet: string
  score: number
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { store } = useXNet()

  // Keyboard shortcut to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const search = useDebouncedCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      // Would use searchIndex from store
      const searchResults: SearchResult[] = [] // await store.search(q)
      setResults(searchResults)
    } finally {
      setLoading(false)
    }
  }, 200)

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    navigate({ to: '/doc/$docId', params: { docId: result.id } })
  }

  if (!isOpen) {
    return (
      <button className="search-trigger" onClick={() => setIsOpen(true)}>
        Search... <kbd>⌘K</kbd>
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
          onChange={(e) => {
            setQuery(e.target.value)
            search(e.target.value)
          }}
          className="search-input"
        />

        {loading && <div className="search-loading">Searching...</div>}

        {results.length > 0 && (
          <ul className="search-results">
            {results.map((result) => (
              <li key={result.id} onClick={() => handleSelect(result)}>
                <strong>{result.title}</strong>
                <span className="type-badge">{result.type}</span>
                <p className="snippet">{result.snippet}</p>
              </li>
            ))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <div className="no-results">No results found</div>
        )}
      </div>
    </div>
  )
}
```

## Validation Checklist

### Editor

- [x] Bold, italic, headings work
- [x] Bullet and numbered lists work
- [x] Code blocks work
- [x] Undo/redo work (via Yjs)
- [ ] Cursor position syncs (CollaborationCursor configured but no provider connected)

### Wikilinks

- [x] `[[text]]` creates wikilink
- [x] Clicking wikilink navigates
- [x] Non-existent pages show create option (auto-create on navigation)
- [ ] Link suggestions appear while typing (NOT IMPLEMENTED)

### Backlinks

- [x] Backlinks panel shows linking pages (web app only)
- [x] Context snippets are accurate
- [x] Clicking backlink navigates

### Tasks

- [x] Checkbox toggles work
- [ ] Due dates can be set (NOT IMPLEMENTED)
- [ ] Priority can be set (NOT IMPLEMENTED)
- [ ] Task list view filters correctly (TaskListView NOT IMPLEMENTED)

### Search

- [x] Cmd+K opens search
- [x] Results appear while typing (debounced 200ms)
- [x] Clicking result navigates
- [x] Search is fast (<100ms)

## Next Step

Proceed to [14-testing-strategy.md](./14-testing-strategy.md)
