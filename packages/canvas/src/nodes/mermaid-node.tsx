/**
 * Mermaid Node Component
 *
 * Renders Mermaid diagrams (flowcharts, sequence diagrams, etc.) on the canvas
 * with live preview, SVG caching, and syntax error handling.
 *
 * NOTE: Mermaid is an optional peer dependency. To use Mermaid diagrams,
 * install it with: pnpm add mermaid
 */

import { useEffect, useState, useRef, useCallback, memo } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MermaidNodeData {
  id: string
  type: 'mermaid'
  properties: {
    code: string
    theme?: 'default' | 'dark' | 'forest' | 'neutral'
    renderedSvg?: string
    lastRenderHash?: string
  }
}

export interface MermaidNodeProps {
  node: MermaidNodeData
  isEditing: boolean
  onUpdate: (changes: Partial<MermaidNodeData['properties']>) => void
  onStartEdit: () => void
  onEndEdit: () => void
}

// ─── Mermaid Module Interface ────────────────────────────────────────────────

interface MermaidModule {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, code: string) => Promise<{ svg: string }>
}

// Lazy-loaded mermaid module
let mermaidModule: MermaidModule | null = null
let mermaidPromise: Promise<MermaidModule> | null = null
let mermaidInitialized = false
let mermaidLoadError: Error | null = null

async function loadMermaid(): Promise<MermaidModule> {
  if (mermaidLoadError) throw mermaidLoadError
  if (mermaidModule) return mermaidModule

  if (!mermaidPromise) {
    // @ts-expect-error - mermaid is an optional peer dependency
    mermaidPromise = import('mermaid')
      .then((m: { default?: MermaidModule }) => {
        mermaidModule = (m.default ?? m) as MermaidModule
        return mermaidModule
      })
      .catch(() => {
        mermaidLoadError = new Error(
          'Mermaid library not available. Install with: pnpm add mermaid'
        )
        mermaidPromise = null
        throw mermaidLoadError
      })
  }

  return mermaidPromise
}

async function initMermaid(theme: string = 'default'): Promise<MermaidModule> {
  const mermaid = await loadMermaid()

  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme,
      flowchart: { useMaxWidth: true }
    })
    mermaidInitialized = true
  }

  return mermaid
}

// ─── Hash Function ───────────────────────────────────────────────────────────

function hashCode(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return String(hash)
}

// ─── Component ───────────────────────────────────────────────────────────────

export const MermaidNodeComponent = memo(function MermaidNodeComponent({
  node,
  isEditing,
  onUpdate,
  onStartEdit,
  onEndEdit
}: MermaidNodeProps) {
  const [svg, setSvg] = useState<string>(node.properties.renderedSvg ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const renderIdRef = useRef(0)

  // Render mermaid diagram
  useEffect(() => {
    if (isEditing) return // Don't re-render while editing

    const code = node.properties.code?.trim()
    if (!code) {
      setSvg('')
      setError(null)
      return
    }

    const hash = hashCode(code)

    // Check cache
    if (hash === node.properties.lastRenderHash && node.properties.renderedSvg) {
      setSvg(node.properties.renderedSvg)
      setError(null)
      return
    }

    const currentRenderId = ++renderIdRef.current
    setIsRendering(true)

    const renderDiagram = async () => {
      try {
        const mermaid = await initMermaid(node.properties.theme)
        const id = `mermaid-${node.id}-${Date.now()}`
        const { svg: renderedSvg } = await mermaid.render(id, code)

        // Only update if this is still the latest render
        if (currentRenderId !== renderIdRef.current) return

        setSvg(renderedSvg)
        setError(null)

        // Cache the result
        onUpdate({
          renderedSvg,
          lastRenderHash: hash
        })
      } catch (err) {
        if (currentRenderId !== renderIdRef.current) return

        const message = err instanceof Error ? err.message : 'Failed to render diagram'
        setError(message)
        setSvg('')
      } finally {
        if (currentRenderId === renderIdRef.current) {
          setIsRendering(false)
        }
      }
    }

    renderDiagram()
  }, [node.properties.code, node.properties.theme, node.id, isEditing, onUpdate])

  // Focus editor on edit start
  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.focus()
      editorRef.current.selectionStart = editorRef.current.value.length
    }
  }, [isEditing])

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ code: e.target.value })
    },
    [onUpdate]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        onEndEdit()
        return
      }

      // Allow Tab for indentation
      if (e.key === 'Tab') {
        e.preventDefault()
        const textarea = e.currentTarget
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const value = textarea.value
        const newValue = value.substring(0, start) + '  ' + value.substring(end)
        onUpdate({ code: newValue })
        // Set cursor position after React updates
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        })
      }
    },
    [onEndEdit, onUpdate]
  )

  const handleDoubleClick = useCallback(() => {
    onStartEdit()
  }, [onStartEdit])

  const handleBlur = useCallback(() => {
    onEndEdit()
  }, [onEndEdit])

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  if (isEditing) {
    return (
      <div className="mermaid-node mermaid-node--editing" style={styles.nodeEditing}>
        <div className="mermaid-editor" style={styles.editor}>
          <textarea
            ref={editorRef}
            value={node.properties.code ?? ''}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="Enter Mermaid diagram code..."
            spellCheck={false}
            style={styles.textarea}
          />
          <div style={styles.help}>
            <a
              href="https://mermaid.js.org/syntax/flowchart.html"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLinkClick}
              style={styles.helpLink}
            >
              Syntax reference
            </a>
          </div>
        </div>

        {/* Live preview */}
        {svg && !error && (
          <div className="mermaid-preview" style={styles.preview}>
            <div style={styles.previewLabel}>Preview</div>
            <div
              className="mermaid-svg"
              style={styles.svgContainer}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        )}
      </div>
    )
  }

  if (isRendering) {
    return (
      <div
        className="mermaid-node mermaid-node--loading"
        style={styles.nodeLoading}
        onDoubleClick={handleDoubleClick}
      >
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span>Rendering diagram...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="mermaid-node mermaid-node--error"
        style={styles.nodeError}
        onDoubleClick={handleDoubleClick}
      >
        <div style={styles.errorBox}>
          <div style={styles.errorIcon}>!</div>
          <div style={styles.errorMessage}>
            <strong style={styles.errorTitle}>Diagram Error</strong>
            <code style={styles.errorCode}>{error}</code>
          </div>
        </div>
        <div style={styles.hint}>Double-click to edit</div>
      </div>
    )
  }

  if (!svg) {
    return (
      <div
        className="mermaid-node mermaid-node--empty"
        style={styles.nodeEmpty}
        onDoubleClick={handleDoubleClick}
      >
        <div style={styles.placeholder}>
          <MermaidIcon />
          <span>Double-click to add diagram</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-node mermaid-node--rendered"
      style={styles.nodeRendered}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="mermaid-svg"
        style={styles.svgContainer}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
})

// ─── Mermaid Icon ────────────────────────────────────────────────────────────

function MermaidIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.5H14M6.5 10V14M17.5 10V14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  nodeEditing: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    padding: '12px',
    width: '100%',
    height: '100%',
    background: 'white',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  editor: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  textarea: {
    flex: 1,
    minHeight: '200px',
    padding: '12px',
    fontFamily: "'Fira Code', 'Monaco', monospace",
    fontSize: '13px',
    lineHeight: 1.5,
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    resize: 'none',
    background: '#f9fafb',
    outline: 'none'
  },
  help: {
    fontSize: '12px',
    color: '#6b7280'
  },
  helpLink: {
    color: '#3b82f6',
    textDecoration: 'none'
  },
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  previewLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  svgContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    overflow: 'auto'
  },
  nodeLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '12px',
    color: '#6b7280',
    width: '100%',
    height: '100%',
    background: 'white',
    borderRadius: '8px'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  nodeError: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '12px',
    color: '#6b7280',
    width: '100%',
    height: '100%',
    background: 'white',
    borderRadius: '8px'
  },
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    background: '#fef2f2',
    borderRadius: '6px',
    width: '100%'
  },
  errorIcon: {
    width: '24px',
    height: '24px',
    background: '#ef4444',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    flexShrink: 0
  },
  errorMessage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  errorTitle: {
    color: '#991b1b'
  },
  errorCode: {
    fontSize: '12px',
    color: '#dc2626',
    wordBreak: 'break-word'
  },
  nodeEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '12px',
    color: '#9ca3af',
    width: '100%',
    height: '100%',
    background: 'white',
    borderRadius: '8px'
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    color: '#9ca3af'
  },
  hint: {
    fontSize: '12px',
    color: '#9ca3af'
  },
  nodeRendered: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
    borderRadius: '8px',
    overflow: 'hidden'
  }
}
