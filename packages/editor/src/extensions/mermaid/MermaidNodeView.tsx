/**
 * MermaidNodeView - React NodeView for Mermaid diagram blocks.
 *
 * Features:
 * - Live preview of Mermaid diagrams
 * - Editable source code
 * - Toggle between edit and preview modes
 * - Error display for invalid syntax
 * - Theme selection
 */
import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { cn } from '../../utils'
import type { MermaidTheme } from './types'

// Lazy load mermaid to avoid SSR issues
let mermaidInstance: typeof import('mermaid').default | null = null
let mermaidInitialized = false

async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import('mermaid')
    mermaidInstance = mod.default
  }
  if (!mermaidInitialized) {
    mermaidInstance.initialize({
      startOnLoad: false,
      // Use 'loose' instead of 'sandbox' - sandbox uses iframes with data URLs
      // which Electron blocks. 'loose' renders SVG directly.
      securityLevel: 'loose',
      theme: 'default'
    })
    mermaidInitialized = true
  }
  return mermaidInstance
}

interface RenderState {
  svg: string | null
  error: string | null
  loading: boolean
}

export function MermaidNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { code, theme } = node.attrs as {
    code: string
    theme: MermaidTheme
  }

  const [isEditing, setIsEditing] = React.useState(!code)
  const [renderState, setRenderState] = React.useState<RenderState>({
    svg: null,
    error: null,
    loading: !!code
  })
  const [localCode, setLocalCode] = React.useState(code)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const renderIdRef = React.useRef(0)

  // Sync local code with node attrs when they change externally
  React.useEffect(() => {
    setLocalCode(code)
  }, [code])

  // Render the diagram
  React.useEffect(() => {
    if (!code) {
      setRenderState({ svg: null, error: null, loading: false })
      return
    }

    const currentRenderId = ++renderIdRef.current
    setRenderState((prev) => ({ ...prev, loading: true }))

    const renderDiagram = async () => {
      try {
        const mermaid = await getMermaid()

        // Update theme if changed
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: theme || 'default'
        })

        // Generate unique ID for this render
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`

        // Render the diagram
        const { svg } = await mermaid.render(id, code)

        // Only update if this is still the latest render
        if (currentRenderId === renderIdRef.current) {
          setRenderState({ svg, error: null, loading: false })
        }
      } catch (err) {
        if (currentRenderId === renderIdRef.current) {
          const message = err instanceof Error ? err.message : 'Failed to render diagram'
          setRenderState({ svg: null, error: message, loading: false })
        }
      }
    }

    // Debounce rendering
    const timeoutId = setTimeout(renderDiagram, 300)
    return () => clearTimeout(timeoutId)
  }, [code, theme])

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value
    setLocalCode(newCode)
  }

  const handleCodeBlur = () => {
    if (localCode !== code) {
      updateAttributes({ code: localCode })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow Tab for indentation
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newCode = localCode.slice(0, start) + '  ' + localCode.slice(end)
      setLocalCode(newCode)

      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      })
    }

    // Escape to exit edit mode
    if (e.key === 'Escape') {
      handleCodeBlur()
      setIsEditing(false)
    }
  }

  const handleApply = () => {
    if (localCode !== code) {
      updateAttributes({ code: localCode })
    }
    setIsEditing(false)
  }

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'rounded-lg border my-4 overflow-hidden',
          'bg-gray-50 dark:bg-gray-900',
          'border-gray-200 dark:border-gray-700',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2',
            'border-b border-gray-200 dark:border-gray-700',
            'bg-white dark:bg-gray-800'
          )}
        >
          {/* Icon */}
          <svg
            className="w-4 h-4 text-gray-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M3 3h18v18H3z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 12h8M12 8v8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Mermaid Diagram
          </span>

          {/* Theme selector */}
          <select
            value={theme || 'default'}
            onChange={(e) => updateAttributes({ theme: e.target.value })}
            className={cn(
              'ml-auto text-xs px-2 py-1 rounded',
              'bg-gray-100 dark:bg-gray-700',
              'border border-gray-200 dark:border-gray-600',
              'text-gray-600 dark:text-gray-300'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="default">Default</option>
            <option value="dark">Dark</option>
            <option value="forest">Forest</option>
            <option value="neutral">Neutral</option>
          </select>

          {/* Edit/Preview toggle */}
          <button
            type="button"
            onClick={() => {
              if (isEditing) {
                handleApply()
              } else {
                setIsEditing(true)
                setTimeout(() => textareaRef.current?.focus(), 0)
              }
            }}
            className={cn(
              'px-2 py-1 text-xs rounded',
              'hover:bg-gray-100 dark:hover:bg-gray-700',
              isEditing
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'text-gray-500'
            )}
          >
            {isEditing ? 'Preview' : 'Edit'}
          </button>
        </div>

        {/* Edit mode */}
        {isEditing && (
          <div className="border-b border-gray-200 dark:border-gray-700">
            <textarea
              ref={textareaRef}
              value={localCode}
              onChange={handleCodeChange}
              onBlur={handleCodeBlur}
              onKeyDown={handleKeyDown}
              placeholder="Enter Mermaid diagram code..."
              className={cn(
                'w-full min-h-[150px] p-3',
                'bg-white dark:bg-gray-800',
                'text-sm font-mono',
                'text-gray-800 dark:text-gray-200',
                'placeholder-gray-400',
                'border-none outline-none resize-y'
              )}
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview */}
        <div className="p-4 min-h-[100px] flex items-center justify-center">
          {renderState.loading && <div className="text-gray-400 text-sm">Rendering diagram...</div>}

          {!renderState.loading && renderState.error && (
            <div className="text-red-500 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded w-full">
              <div className="font-medium mb-1">Syntax Error</div>
              <pre className="text-xs whitespace-pre-wrap">{renderState.error}</pre>
            </div>
          )}

          {!renderState.loading && renderState.svg && (
            <div
              className="mermaid-diagram w-full overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: renderState.svg }}
            />
          )}

          {!renderState.loading && !renderState.svg && !renderState.error && (
            <div className="text-gray-400 text-sm">
              {isEditing ? 'Enter diagram code above' : 'Click Edit to add a diagram'}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
