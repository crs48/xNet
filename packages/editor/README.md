# @xnet/editor

Framework-agnostic collaborative text editor for xNet, built on [Yjs](https://yjs.dev/).

## Features

- **Framework agnostic** - Works with vanilla JS, React, Vue, Svelte, or any framework
- **Real-time collaboration** - Built on Yjs CRDT for conflict-free sync
- **Simple API** - Easy to integrate with any text input or rich text editor
- **TypeScript** - Full type definitions included

## Installation

```bash
pnpm add @xnet/editor
```

## Usage

### Vanilla JavaScript

```ts
import { createEditor } from '@xnet/editor'
import * as Y from 'yjs'

// Create a Yjs document
const ydoc = new Y.Doc()

// Create the editor
const editor = createEditor({
  ydoc,
  field: 'content', // Y.Text field name
  onChange: (content) => {
    console.log('Content changed:', content)
  }
})

// Get content
const content = editor.getContent()

// Set content
editor.setContent('Hello, world!')

// Insert at position
editor.insert(5, ' beautiful')

// Delete range
editor.delete(0, 6)

// Clean up when done
editor.destroy()
```

### With React (@xnet/react)

```tsx
import { useEditor } from '@xnet/react'
import { useDocument } from '@xnet/react'

function Editor({ docId }: { docId: string }) {
  const { data: document } = useDocument(docId)

  const {
    content,
    handleChange,
    handleSelect,
    handleFocus,
    handleBlur
  } = useEditor({
    ydoc: document?.ydoc ?? null,
    field: 'content',
    placeholder: 'Start typing...'
  })

  return (
    <textarea
      value={content}
      onChange={handleChange}
      onSelect={handleSelect}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder="Start typing..."
    />
  )
}
```

### With Vue (example)

```vue
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { createEditor } from '@xnet/editor'
import * as Y from 'yjs'

const props = defineProps<{ ydoc: Y.Doc }>()
const content = ref('')

const editor = createEditor({
  ydoc: props.ydoc,
  field: 'content',
  onChange: (newContent) => {
    content.value = newContent
  }
})

function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  editor.applyDelta(content.value, target.value, target.selectionStart)
}

onUnmounted(() => editor.destroy())
</script>

<template>
  <textarea :value="content" @input="handleInput" />
</template>
```

## API

### `createEditor(config)`

Creates a new editor instance.

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ydoc` | `Y.Doc` | required | The Yjs document to bind to |
| `field` | `string` | `'content'` | The Y.Text field name |
| `placeholder` | `string` | `''` | Placeholder text |
| `readOnly` | `boolean` | `false` | Whether editing is disabled |
| `onChange` | `(content: string) => void` | - | Called when content changes |
| `onSelectionChange` | `(selection: Selection) => void` | - | Called when selection changes |

### Editor Methods

| Method | Description |
|--------|-------------|
| `getContent()` | Get current content as string |
| `setContent(content)` | Replace all content |
| `insert(index, text)` | Insert text at position |
| `delete(index, length)` | Delete text at range |
| `applyDelta(oldText, newText, selectionStart)` | Apply a text change (for input handling) |
| `getYText()` | Get the underlying Y.Text instance |
| `getYDoc()` | Get the underlying Y.Doc instance |
| `on(event, handler)` | Add event listener (returns unsubscribe fn) |
| `off(event, handler)` | Remove event listener |
| `destroy()` | Clean up and remove observers |

### Events

| Event | Data | Description |
|-------|------|-------------|
| `change` | `string` | Content changed (local or remote) |
| `remote-update` | `string` | Content changed from remote peer |
| `selection` | `Selection` | Selection changed |
| `focus` | `undefined` | Editor focused |
| `blur` | `undefined` | Editor blurred |

## Integration with Rich Text Editors

The editor core can be integrated with rich text editors like ProseMirror, TipTap, or Slate by:

1. Using `getYText()` to access the underlying Y.Text
2. Using Yjs bindings for your editor (e.g., `y-prosemirror`, `y-tiptap`)

```ts
import { createEditor } from '@xnet/editor'
import { yTextToSlateElement } from '@slate-yjs/core'

const editor = createEditor({ ydoc, field: 'content' })
const ytext = editor.getYText()

// Use with Slate
const slateValue = yTextToSlateElement(ytext)
```

## Related Packages

- `@xnet/data` - Yjs document management and CRDT operations
- `@xnet/react` - React hooks including `useEditor`
- `@xnet/sdk` - Full xNet SDK

## License

MIT
