# 08: CodeBlock NodeView

> Custom NodeView showing ``` fences and language selector when focused

**Duration:** 0.5 days  
**Dependencies:** [07-heading-nodeview.md](./07-heading-nodeview.md), [10-focus-detection.md](./10-focus-detection.md)

## Overview

The CodeBlock NodeView provides an Obsidian-style experience where:

1. When focused: Shows ``` fences at top and bottom, with language selector
2. When unfocused: Shows just the styled code block without fences
3. Language can be selected from a dropdown when focused

````mermaid
stateDiagram-v2
    [*] --> Unfocused
    Unfocused --> Focused: Cursor enters
    Focused --> Unfocused: Cursor leaves

    state Unfocused {
        [*] --> StyledBlock
        StyledBlock: Rounded container
        StyledBlock: Syntax highlighted code
        StyledBlock: No visible fences
    }

    state Focused {
        [*] --> EditMode
        EditMode: ```javascript (editable)
        EditMode: Code content
        EditMode: ``` (closing fence)
    }
````

## Implementation

### 1. CodeBlock NodeView Component

````typescript
// packages/editor/src/nodeviews/CodeBlockView.tsx

import { memo, useState, useCallback } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { cn } from '../utils'
import { useNodeFocus } from './hooks/useNodeFocus'

const LANGUAGES = [
  { id: 'plaintext', name: 'Plain text' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'python', name: 'Python' },
  { id: 'rust', name: 'Rust' },
  { id: 'go', name: 'Go' },
  { id: 'java', name: 'Java' },
  { id: 'c', name: 'C' },
  { id: 'cpp', name: 'C++' },
  { id: 'csharp', name: 'C#' },
  { id: 'html', name: 'HTML' },
  { id: 'css', name: 'CSS' },
  { id: 'json', name: 'JSON' },
  { id: 'yaml', name: 'YAML' },
  { id: 'markdown', name: 'Markdown' },
  { id: 'bash', name: 'Bash' },
  { id: 'shell', name: 'Shell' },
  { id: 'sql', name: 'SQL' },
  { id: 'graphql', name: 'GraphQL' },
  { id: 'docker', name: 'Dockerfile' },
] as const

export const CodeBlockView = memo(function CodeBlockView({
  node,
  editor,
  getPos,
  updateAttributes,
}: NodeViewProps) {
  const isFocused = useNodeFocus(editor, getPos)
  const language = node.attrs.language || 'plaintext'

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: e.target.value })
    },
    [updateAttributes]
  )

  return (
    <NodeViewWrapper
      className={cn(
        'code-block-wrapper',
        'my-4 rounded-lg',
        'bg-muted/50 border border-border',
        'transition-all duration-150',
        isFocused && 'ring-2 ring-primary/20 border-primary/30'
      )}
      data-language={language}
      data-focused={isFocused}
    >
      {/* Opening fence - visible when focused */}
      <div
        className={cn(
          'code-fence code-fence-open',
          'flex items-center gap-2',
          'px-4 py-2',
          'border-b border-border/50',
          'font-mono text-sm text-muted-foreground/60',
          'transition-all duration-150 ease-out',
          isFocused
            ? 'opacity-100 max-h-12'
            : 'opacity-0 max-h-0 overflow-hidden py-0 border-b-0'
        )}
        contentEditable={false}
      >
        <span className="select-none">```</span>

        {/* Language selector */}
        <select
          value={language}
          onChange={handleLanguageChange}
          className={cn(
            'bg-transparent',
            'text-muted-foreground hover:text-foreground',
            'border-none outline-none',
            'cursor-pointer',
            'transition-colors duration-100'
          )}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* Code content */}
      <NodeViewContent
        as="pre"
        className={cn(
          'p-4 overflow-x-auto',
          'font-mono text-sm leading-relaxed',
          'bg-transparent',
          '[&>code]:block [&>code]:w-full'
        )}
      />

      {/* Closing fence - visible when focused */}
      <div
        className={cn(
          'code-fence code-fence-close',
          'px-4 py-2',
          'border-t border-border/50',
          'font-mono text-sm text-muted-foreground/60',
          'transition-all duration-150 ease-out',
          isFocused
            ? 'opacity-100 max-h-12'
            : 'opacity-0 max-h-0 overflow-hidden py-0 border-t-0'
        )}
        contentEditable={false}
      >
        <span className="select-none">```</span>
      </div>
    </NodeViewWrapper>
  )
})
````

### 2. CodeBlock Extension Override

````typescript
// packages/editor/src/extensions/codeblock-with-syntax.ts

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CodeBlockView } from '../nodeviews/CodeBlockView'

export interface CodeBlockWithSyntaxOptions {
  languages: readonly { id: string; name: string }[]
  defaultLanguage: string
  HTMLAttributes: Record<string, any>
}

export const CodeBlockWithSyntax = Node.create<CodeBlockWithSyntaxOptions>({
  name: 'codeBlock',

  addOptions() {
    return {
      languages: [],
      defaultLanguage: 'plaintext',
      HTMLAttributes: {}
    }
  },

  content: 'text*',

  marks: '',

  group: 'block',

  code: true,

  defining: true,

  addAttributes() {
    return {
      language: {
        default: this.options.defaultLanguage,
        parseHTML: (element) =>
          element.getAttribute('data-language') ||
          element.querySelector('code')?.className?.replace('language-', '') ||
          this.options.defaultLanguage,
        renderHTML: (attributes) => ({
          'data-language': attributes.language
        })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full'
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      ['code', { class: `language-${node.attrs.language}` }, 0]
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),

      // Tab to indent within code block
      Tab: () => {
        if (this.editor.isActive('codeBlock')) {
          this.editor.commands.insertContent('  ')
          return true
        }
        return false
      },

      // Exit code block with triple Enter at end
      Enter: ({ editor }) => {
        if (!editor.isActive('codeBlock')) return false

        const { $from } = editor.state.selection
        const isAtEnd = $from.parentOffset === $from.parent.content.size
        const endsWithDoubleNewline = $from.parent.textContent.endsWith('\n\n')

        if (isAtEnd && endsWithDoubleNewline) {
          // Exit code block
          return editor
            .chain()
            .command(({ tr }) => {
              // Remove trailing newlines
              tr.delete($from.pos - 2, $from.pos)
              return true
            })
            .exitCode()
            .run()
        }

        return false
      }
    }
  },

  addInputRules() {
    return [
      // ``` at start of line creates code block
      {
        find: /^```([a-z]*)?[\s\n]$/,
        handler: ({ state, range, match }) => {
          const language = match[1] || this.options.defaultLanguage

          state.tr
            .delete(range.from, range.to)
            .setBlockType(range.from, range.from, this.type, { language })
        }
      }
    ]
  }
})
````

### 3. CSS Styles

```css
/* packages/editor/src/styles/codeblock.css */

/* Code block container */
.code-block-wrapper {
  position: relative;
}

/* Code content area */
.code-block-wrapper pre {
  margin: 0;
  background: transparent;
}

.code-block-wrapper pre code {
  display: block;
  font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
  font-size: 0.875rem;
  line-height: 1.7;
  tab-size: 2;
}

/* Fence styling */
.code-fence {
  font-family: var(--font-mono);
  user-select: none;
}

/* Language selector */
.code-fence select {
  font-family: var(--font-mono);
  font-size: 0.875rem;
}

.code-fence select option {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}

/* Syntax highlighting integration */
.code-block-wrapper .hljs {
  background: transparent;
  padding: 0;
}
```

## Tests

```typescript
// packages/editor/src/nodeviews/CodeBlockView.test.tsx

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { CodeBlockWithSyntax } from '../extensions/codeblock-with-syntax'

function TestEditor({ content }: { content: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockWithSyntax,
    ],
    content,
  })
  return <EditorContent editor={editor} />
}

describe('CodeBlockView', () => {
  describe('rendering', () => {
    it('should render code block', () => {
      render(
        <TestEditor content="<pre><code>const x = 1</code></pre>" />
      )

      expect(screen.getByText('const x = 1')).toBeInTheDocument()
    })

    it('should hide fences when unfocused', () => {
      render(
        <TestEditor content="<pre><code>const x = 1</code></pre>" />
      )

      const fences = document.querySelectorAll('.code-fence')
      fences.forEach(fence => {
        expect(fence).toHaveClass('opacity-0')
      })
    })
  })

  describe('focus behavior', () => {
    it('should show fences when focused', async () => {
      render(
        <TestEditor content="<pre><code>const x = 1</code></pre>" />
      )

      // Click on the code block
      fireEvent.click(screen.getByText('const x = 1'))

      await new Promise(r => setTimeout(r, 50))

      const fences = document.querySelectorAll('.code-fence')
      fences.forEach(fence => {
        expect(fence).toHaveClass('opacity-100')
      })
    })
  })

  describe('language selector', () => {
    it('should render language dropdown', async () => {
      render(
        <TestEditor content='<pre data-language="javascript"><code>const x = 1</code></pre>' />
      )

      fireEvent.click(screen.getByText('const x = 1'))
      await new Promise(r => setTimeout(r, 50))

      const select = document.querySelector('select')
      expect(select).toBeInTheDocument()
      expect(select?.value).toBe('javascript')
    })

    it('should change language on selection', async () => {
      render(
        <TestEditor content='<pre data-language="javascript"><code>const x = 1</code></pre>' />
      )

      fireEvent.click(screen.getByText('const x = 1'))
      await new Promise(r => setTimeout(r, 50))

      const select = document.querySelector('select')!
      fireEvent.change(select, { target: { value: 'typescript' } })

      expect(select.value).toBe('typescript')
    })
  })
})
```

## Keyboard Shortcuts

| Shortcut             | Action                   |
| -------------------- | ------------------------ |
| `Cmd+Alt+C`          | Toggle code block        |
| `Tab`                | Indent (insert 2 spaces) |
| `Enter` x3 at end    | Exit code block          |
| ``` at start of line | Create code block        |

## Checklist

- [ ] Create CodeBlockView component
- [ ] Create CodeBlockWithSyntax extension
- [ ] Add language selector dropdown
- [ ] Show/hide fences on focus
- [ ] Add smooth transitions
- [ ] Handle keyboard shortcuts
- [ ] Add input rule for ``` syntax
- [ ] Style the component
- [ ] Write tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Heading NodeView](./07-heading-nodeview.md) | [Next: Blockquote NodeView](./09-blockquote-nodeview.md)
