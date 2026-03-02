import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { memo, useCallback } from 'react'
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
  { id: 'docker', name: 'Dockerfile' }
] as const

/**
 * CodeBlockView - Shows ``` fences and language selector when focused.
 */
export const CodeBlockView = memo(function CodeBlockView({
  node,
  editor,
  getPos,
  updateAttributes
}: NodeViewProps) {
  const isFocused = useNodeFocus(editor, getPos)
  const language = (node.attrs as { language?: string }).language || 'plaintext'

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
        'bg-secondary border border-border',
        'transition-colors duration-150',
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
          'min-h-9',
          'border-b border-border/50',
          'font-mono text-sm text-muted-foreground/60',
          'transition-opacity duration-150 ease-out',
          isFocused ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
      <pre
        className={cn(
          'p-4 overflow-x-auto m-0',
          'font-mono text-sm leading-relaxed',
          'bg-transparent',
          '[&>code]:block [&>code]:w-full'
        )}
      >
        <NodeViewContent className="outline-none" />
      </pre>

      {/* Closing fence - visible when focused */}
      <div
        className={cn(
          'code-fence code-fence-close',
          'px-4 py-2',
          'min-h-9',
          'border-t border-border/50',
          'font-mono text-sm text-muted-foreground/60',
          'transition-opacity duration-150 ease-out',
          isFocused ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        contentEditable={false}
      >
        <span className="select-none">```</span>
      </div>
    </NodeViewWrapper>
  )
})
