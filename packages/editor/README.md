# @xnet/editor

Collaborative rich text editor for xNet, built on [TipTap](https://tiptap.dev/) and [Yjs](https://yjs.dev/).

## Features

- **Collaborative editing** - Real-time sync via Yjs CRDT
- **Notion-like shortcuts** - Markdown-style formatting as you type
- **Wikilinks** - `[[page name]]` syntax with navigation callbacks
- **Live preview** - Obsidian-style reveal of markdown syntax
- **Task lists** - Checkbox items with nesting support
- **React components** - Ready-to-use `RichTextEditor` and `EditorToolbar`

## Installation

```bash
pnpm add @xnet/editor @xnet/react @xnet/data
```

## Quick Start with React

The recommended way to use `@xnet/editor` is with the `useNode` hook from `@xnet/react`:

```tsx
import { useNode } from '@xnet/react'
import { RichTextEditor } from '@xnet/editor/react'
import { defineSchema, text } from '@xnet/data'

// Define a schema with document support
const PageSchema = defineSchema({
  name: 'Page',
  namespace: 'myapp://',
  properties: {
    title: text({ required: true })
  },
  document: 'yjs' // Enable Y.Doc for rich text
})

function DocumentEditor({ pageId }: { pageId: string }) {
  const {
    data: page,
    doc, // Y.Doc for rich text
    loading,
    error,
    syncStatus, // 'offline' | 'connecting' | 'connected'
    peerCount // Connected peers
  } = useNode(PageSchema, pageId, {
    createIfMissing: { title: 'Untitled' }
  })

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>
  if (!doc) return <p>Not found</p>

  return (
    <div>
      <h1>{page?.title}</h1>
      <span>
        {syncStatus === 'connected' ? 'Synced' : 'Offline'} ({peerCount} peers)
      </span>

      <RichTextEditor
        ydoc={doc}
        field="content"
        placeholder="Start writing..."
        onNavigate={(docId) => {
          // Handle wikilink navigation
          window.location.href = `/doc/${docId}`
        }}
      />
    </div>
  )
}
```

## React Components

### `RichTextEditor`

Full-featured rich text editor with toolbar and Yjs collaboration.

```tsx
import { RichTextEditor } from '@xnet/editor/react'
;<RichTextEditor
  ydoc={doc}
  field="content"
  placeholder="Start writing..."
  showToolbar={true}
  readOnly={false}
  onNavigate={(docId) => navigate(`/doc/${docId}`)}
  className="my-editor"
/>
```

**Props:**

| Prop          | Type                      | Default              | Description                 |
| ------------- | ------------------------- | -------------------- | --------------------------- |
| `ydoc`        | `Y.Doc`                   | required             | The Yjs document to bind to |
| `field`       | `string`                  | `'content'`          | Y.XmlFragment field name    |
| `placeholder` | `string`                  | `'Start writing...'` | Placeholder text            |
| `showToolbar` | `boolean`                 | `true`               | Show formatting toolbar     |
| `readOnly`    | `boolean`                 | `false`              | Disable editing             |
| `onNavigate`  | `(docId: string) => void` | -                    | Wikilink click handler      |
| `className`   | `string`                  | -                    | Additional CSS class        |

### `EditorToolbar`

Standalone toolbar component (used internally by RichTextEditor).

```tsx
import { EditorToolbar, useEditor } from '@xnet/editor/react'

function CustomEditor({ doc }) {
  const editor = useEditor({
    extensions: [
      /* ... */
    ]
  })

  return (
    <div>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
```

**Props:**

| Prop        | Type             | Description            |
| ----------- | ---------------- | ---------------------- |
| `editor`    | `Editor \| null` | TipTap editor instance |
| `className` | `string`         | Additional CSS class   |

## Keyboard Shortcuts

The editor supports Notion-style Markdown shortcuts:

**Text Formatting:**

- `**text**` or `Cmd+B` → **bold**
- `*text*` or `_text_` or `Cmd+I` → _italic_
- `~~text~~` → ~~strikethrough~~
- `` `code` `` → `inline code`

**Headings:**

- `# ` → Heading 1
- `## ` → Heading 2
- `### ` → Heading 3

**Lists:**

- `- ` or `* ` → Bullet list
- `1. ` → Numbered list
- `[] ` → Task list (checkbox)

**Blocks:**

- `> ` → Blockquote
- `---` → Horizontal rule
- ` ``` ` → Code block

**Links:**

- `[[page name]]` → Wikilink (triggers `onNavigate`)

## Vanilla JavaScript

For non-React usage, use the core `createEditor` function:

```ts
import { createEditor } from '@xnet/editor'
import * as Y from 'yjs'

const ydoc = new Y.Doc()

const editor = createEditor({
  ydoc,
  field: 'content',
  onChange: (content) => {
    console.log('Content changed:', content)
  }
})

// Get/set content
const content = editor.getContent()
editor.setContent('Hello, world!')

// Insert/delete
editor.insert(5, ' beautiful')
editor.delete(0, 6)

// Clean up
editor.destroy()
```

### Core API

**`createEditor(config)`**

| Option              | Type                             | Default     | Description               |
| ------------------- | -------------------------------- | ----------- | ------------------------- |
| `ydoc`              | `Y.Doc`                          | required    | Yjs document              |
| `field`             | `string`                         | `'content'` | Y.Text field name         |
| `placeholder`       | `string`                         | `''`        | Placeholder text          |
| `readOnly`          | `boolean`                        | `false`     | Disable editing           |
| `onChange`          | `(content: string) => void`      | -           | Content change callback   |
| `onSelectionChange` | `(selection: Selection) => void` | -           | Selection change callback |

**Editor Methods:**

| Method                         | Description           |
| ------------------------------ | --------------------- |
| `getContent()`                 | Get content as string |
| `setContent(content)`          | Replace all content   |
| `insert(index, text)`          | Insert at position    |
| `delete(index, length)`        | Delete range          |
| `applyDelta(old, new, cursor)` | Apply text change     |
| `getYText()`                   | Get Y.Text instance   |
| `getYDoc()`                    | Get Y.Doc instance    |
| `destroy()`                    | Clean up              |

## Exports

```ts
// React components (recommended)
import { RichTextEditor, EditorToolbar } from '@xnet/editor/react'

// Re-exported from @tiptap/react for advanced usage
import { useEditor, EditorContent, Editor } from '@xnet/editor/react'

// Vanilla JS
import { createEditor } from '@xnet/editor'
```

## Related Packages

- `@xnet/react` - React hooks (`useNode`, `useQuery`, `useMutate`)
- `@xnet/data` - Schema system and NodeStore
- `@xnet/storage` - IndexedDB storage adapter

## License

MIT
