/** Controlled CodeMirror editor. Source stays inert until the caller explicitly runs it. */
import type { Extension } from '@codemirror/state'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth
} from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting
} from '@codemirror/language'
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap
} from '@codemirror/search'
import { Annotation, Compartment, EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  rectangularSelection
} from '@codemirror/view'
import { Redo2, Search, Undo2, WrapText } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

export type CodeEditorLanguage =
  | 'javascript'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'rust'
  | 'c'
  | 'plaintext'

export interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: CodeEditorLanguage
  readOnly?: boolean
  placeholder?: string
  className?: string
  ariaLabel?: string
  /** Show search, history, wrapping controls and cursor position. */
  showToolbar?: boolean
  /** Cmd/Ctrl+Enter; the caller decides whether this runs or reviews the code. */
  onRun?: () => void
}

export function codeMirrorLanguage(language: CodeEditorLanguage): Extension {
  switch (language) {
    case 'javascript':
      return javascript()
    case 'typescript':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'python':
      return python()
    case 'rust':
      return rust()
    case 'c':
      return cpp()
    case 'plaintext':
      return []
  }
}

const externalChange = Annotation.define<boolean>()
export const codeEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'hsl(var(--foreground))',
    backgroundColor: 'hsl(var(--background))'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: '1.65' },
  '.cm-content': { padding: '12px 0', caretColor: 'hsl(var(--foreground))' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--muted) / 0.4)',
    color: 'hsl(var(--muted-foreground))',
    borderRight: '1px solid hsl(var(--border))'
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'hsl(var(--muted) / 0.65)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'hsl(var(--primary) / 0.17)'
  },
  '.cm-panels, .cm-tooltip': {
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    borderColor: 'hsl(var(--border))'
  },
  '.cm-panels': { fontFamily: 'system-ui, sans-serif', fontSize: '12px' },
  '.cm-search': {
    padding: '8px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center'
  },
  '.cm-textfield, .cm-button': {
    border: '1px solid hsl(var(--border))',
    borderRadius: '5px',
    background: 'hsl(var(--background))',
    color: 'inherit',
    fontSize: '12px'
  },
  '.cm-textfield': { maxWidth: '100%', padding: '4px 6px' },
  '.cm-button': { padding: '3px 7px' },
  '.cm-search label': { display: 'inline-flex', gap: '4px', alignItems: 'center' }
})

export function CodeEditor({
  value,
  onChange,
  language = 'javascript',
  readOnly = false,
  placeholder,
  className,
  ariaLabel = 'Code editor',
  showToolbar = false,
  onRun
}: CodeEditorProps): JSX.Element {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const languageCompartment = React.useRef(new Compartment())
  const readOnlyCompartment = React.useRef(new Compartment())
  const wrapCompartment = React.useRef(new Compartment())
  const labelCompartment = React.useRef(new Compartment())
  const [wrap, setWrap] = React.useState(false)
  const [cursor, setCursor] = React.useState({ line: 1, column: 1, undo: false, redo: false })
  const onChangeRef = React.useRef(onChange)
  const onRunRef = React.useRef(onRun)
  onChangeRef.current = onChange
  onRunRef.current = onRun

  React.useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          rectangularSelection(),
          indentOnInput(),
          indentUnit.of('  '),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          codeEditorTheme,
          EditorState.allowMultipleSelections.of(true),
          // Completion may consume Escape before CodeMirror's default escape hatch.
          // Observe it too, so Escape then Tab always returns to normal focus navigation.
          EditorView.domEventObservers({
            keydown: (event, view) => {
              if (event.key === 'Escape') view.setTabFocusMode(2000)
            }
          }),
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                onRunRef.current?.()
                return Boolean(onRunRef.current)
              }
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab
          ]),
          languageCompartment.current.of(codeMirrorLanguage(language)),
          readOnlyCompartment.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly)
          ]),
          wrapCompartment.current.of([]),
          labelCompartment.current.of(EditorView.contentAttributes.of({ 'aria-label': ariaLabel })),
          placeholder ? placeholderExt(placeholder) : [],
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(externalChange))
            ) {
              onChangeRef.current?.(update.state.doc.toString())
            }
            if (update.docChanged || update.selectionSet) {
              const position = update.state.selection.main.head
              const line = update.state.doc.lineAt(position)
              setCursor({
                line: line.number,
                column: position - line.from + 1,
                undo: undoDepth(update.state) > 0,
                redo: redoDepth(update.state) > 0
              })
            }
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // These initial values are kept current by compartments and controlled updates below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: externalChange.of(true)
      })
    }
  }, [value])
  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.current.reconfigure(codeMirrorLanguage(language))
    })
  }, [language])
  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly)
      ])
    })
  }, [readOnly])
  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: labelCompartment.current.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel })
      )
    })
  }, [ariaLabel])
  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(wrap ? EditorView.lineWrapping : [])
    })
  }, [wrap])
  const command = (run: (view: EditorView) => boolean) => {
    if (!viewRef.current) return
    run(viewRef.current)
    viewRef.current.focus()
  }
  const toolClass =
    'inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-30'

  return (
    <div
      data-testid="code-editor"
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background text-xs focus-within:ring-1 focus-within:ring-ring/30',
        className
      )}
    >
      {showToolbar && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
          <span className="mr-auto px-1 font-mono text-xs">
            index.
            {language === 'tsx'
              ? 'tsx'
              : language === 'typescript'
                ? 'ts'
                : language === 'javascript'
                  ? 'js'
                  : language}
          </span>
          <button
            type="button"
            className={toolClass}
            aria-label="Find and replace"
            title="Find and replace (⌘/Ctrl+F)"
            onClick={() => {
              if (viewRef.current) openSearchPanel(viewRef.current)
            }}
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-label="Undo code edit"
            title="Undo (⌘/Ctrl+Z)"
            disabled={readOnly || !cursor.undo}
            onClick={() => command(undo)}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-label="Redo code edit"
            title="Redo (⌘/Ctrl+Shift+Z)"
            disabled={readOnly || !cursor.redo}
            onClick={() => command(redo)}
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-label="Wrap lines"
            title="Wrap lines"
            aria-pressed={wrap}
            onClick={() => setWrap((current) => !current)}
          >
            <WrapText size={14} />
          </button>
        </div>
      )}
      <div ref={hostRef} className="min-h-0 min-w-0 flex-1 overflow-hidden font-mono text-[13px]" />
      {showToolbar && (
        <div className="flex shrink-0 flex-wrap justify-between gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>
            Ln {cursor.line}, Col {cursor.column} ·{' '}
            {language === 'tsx' ? 'TypeScript React' : language}
          </span>
          <span title="Press Escape, then Tab to move focus out of the editor.">
            Tab indents · Esc, Tab exits
          </span>
        </div>
      )}
    </div>
  )
}
