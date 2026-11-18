import { defaultKeymap } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { getChunks, getOriginalDoc, unifiedMergeView } from '@codemirror/merge'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightSpecialChars } from '@codemirror/view'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../utils'
import { codeDiffSummary } from './code-diff'
import { codeEditorTheme } from './CodeEditor'

const diffTheme = EditorView.theme({
  '.cm-deletedChunk': { backgroundColor: 'rgb(220 38 38 / 0.09)' },
  '&.cm-merge-b .cm-changedLine': { backgroundColor: 'rgb(22 163 74 / 0.09)' },
  '.cm-deletedLine': { position: 'relative', paddingLeft: '14px' },
  '.cm-deletedLine::before': { content: '"−"', position: 'absolute', left: '0' },
  '.cm-changedLine::before': { content: '"+"', marginRight: '6px' },
  '.cm-deletedChunk del': { textDecoration: 'none' },
  '.cm-deletedText': { backgroundColor: 'rgb(220 38 38 / 0.14)' },
  '.cm-insertedText': { backgroundColor: 'rgb(22 163 74 / 0.14)' }
})

/** Inert TSX comparison. No merge controls and no connection to an extension runtime. */
export function CodeDiffViewer({
  before,
  after,
  className
}: {
  before: string
  after: string
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const [activeChange, setActiveChange] = useState(0)
  const comparison = useMemo(() => {
    const state = EditorState.create({
      doc: after,
      extensions: [
        javascript({ typescript: true, jsx: true }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        lineNumbers(),
        highlightSpecialChars(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({
          'aria-label': 'Extension code changes',
          'aria-readonly': 'true',
          tabindex: '0'
        }),
        EditorView.lineWrapping,
        search({ top: true }),
        keymap.of([...defaultKeymap, ...searchKeymap]),
        codeEditorTheme,
        unifiedMergeView({
          original: before,
          mergeControls: false,
          gutter: true,
          diffConfig: { scanLimit: 10000, timeout: 100 }
        }),
        diffTheme
      ]
    })
    const chunks = getChunks(state)!.chunks
    return { state, chunks, ...codeDiffSummary(getOriginalDoc(state), state.doc, chunks) }
  }, [before, after])

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({ parent: host.current, state: comparison.state })
    view.current = editor
    setActiveChange(0)
    const first = comparison.chunks[0]
    if (first) editor.dispatch({ effects: EditorView.scrollIntoView(first.fromB, { y: 'center' }) })
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [comparison])

  const navigate = (step: number) => {
    const index = (activeChange + step + comparison.chunks.length) % comparison.chunks.length
    const position = Math.min(comparison.chunks[index].fromB, comparison.state.doc.length)
    view.current?.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' })
    })
    setActiveChange(index)
  }
  const toolClass =
    'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'
  return (
    <section
      aria-label="Source diff"
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="font-mono">index.tsx</span>
        <span
          className="text-emerald-700 dark:text-emerald-400"
          aria-label={`${comparison.added} added lines`}
        >
          +{comparison.added}
        </span>
        <span
          className="text-red-700 dark:text-red-400"
          aria-label={`${comparison.removed} removed lines`}
        >
          −{comparison.removed}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span role="status" className="text-[10px] text-muted-foreground">
            {comparison.chunks.length
              ? `${activeChange + 1} of ${comparison.chunks.length} changes`
              : 'No code changes'}
          </span>
          <button
            className={toolClass}
            aria-label="Previous change"
            disabled={!comparison.chunks.length}
            onClick={() => navigate(-1)}
          >
            <ChevronUp size={15} />
          </button>
          <button
            className={toolClass}
            aria-label="Next change"
            disabled={!comparison.chunks.length}
            onClick={() => navigate(1)}
          >
            <ChevronDown size={15} />
          </button>
          <button
            className={toolClass}
            aria-label="Search code"
            onClick={() => {
              if (view.current) openSearchPanel(view.current)
            }}
          >
            <Search size={15} />
          </button>
        </div>
      </div>
      {!comparison.precise && (
        <p role="status" className="border-b border-border p-2 text-xs text-muted-foreground">
          Large changes are grouped to keep this comparison responsive.
        </p>
      )}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden font-mono text-xs" />
      <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        Read-only · + added · − removed · Line numbers refer to the “To” version
      </p>
    </section>
  )
}
