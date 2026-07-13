/**
 * Mermaid diagram block. Replaces the plugin-contributed TipTap
 * MermaidExtension; the spec lives here (the mermaid dep already does) and
 * plugins contribute it via the blockSpecs contribution channel.
 */
import { createReactBlockSpec } from '@blocknote/react'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'

let mermaidIdCounter = 0

function MermaidDiagram({
  code,
  editable,
  onEdit
}: {
  code: string
  editable: boolean
  onEdit: (code: string) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(code)

  useEffect(() => {
    setDraft(code)
  }, [code])

  useEffect(() => {
    if (editing || !code.trim()) return
    let cancelled = false
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        const { svg } = await mermaid.render(`xnet-mermaid-${++mermaidIdCounter}`, code)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Invalid diagram')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, editing])

  if (editing) {
    return (
      <div data-mermaid-editing="" className="xnet-mermaid-editing">
        <textarea
          className="xnet-mermaid-source w-full font-mono text-sm"
          rows={Math.max(4, draft.split('\n').length + 1)}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            setEditing(false)
            onEdit(draft)
          }}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div
      data-mermaid=""
      className="xnet-mermaid"
      role={editable ? 'button' : undefined}
      onDoubleClick={editable ? () => setEditing(true) : undefined}
    >
      {error ? (
        <pre className="xnet-mermaid-error text-sm">{error}</pre>
      ) : code.trim() ? (
        <div ref={containerRef} />
      ) : (
        <div className="xnet-mermaid-placeholder">Double-click to add a Mermaid diagram</div>
      )}
    </div>
  )
}

export const MermaidBlockSpec = createReactBlockSpec(
  {
    type: 'mermaid',
    propSchema: {
      code: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ block, editor }) => (
      <MermaidDiagram
        code={block.props.code}
        editable={editor.isEditable}
        onEdit={(code) => editor.updateBlock(block, { props: { code } })}
      />
    )
  }
)
