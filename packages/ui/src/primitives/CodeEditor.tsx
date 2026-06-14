/**
 * CodeEditor — a thin CodeMirror 6 wrapper for Lab code (exploration 0180).
 *
 * Controlled component: `value` in, `onChange` out. The language extension is
 * swapped reactively via a Compartment (no remount), `Mod-Enter` fires
 * `onRun`, and the editor inherits the workbench monospace look. CodeMirror is
 * mounted lazily on a real DOM node so this degrades gracefully under SSR.
 */

import { cpp } from '@codemirror/lang-cpp'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import * as React from 'react'
import { cn } from '../utils'

export type CodeEditorLanguage =
  | 'javascript'
  | 'typescript'
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
  /** Fired on Mod-Enter (Cmd/Ctrl+Enter) — typically "run the Lab". */
  onRun?: () => void
}

/** Map a Lab language to its CodeMirror language extension(s). */
export function codeMirrorLanguage(language: CodeEditorLanguage): Extension {
  switch (language) {
    case 'javascript':
      return javascript()
    case 'typescript':
      return javascript({ typescript: true })
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

export function CodeEditor({
  value,
  onChange,
  language = 'javascript',
  readOnly = false,
  placeholder,
  className,
  onRun
}: CodeEditorProps): JSX.Element {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const languageCompartment = React.useRef(new Compartment())
  const readOnlyCompartment = React.useRef(new Compartment())
  // Keep the latest callbacks without re-creating the editor on every render.
  const onChangeRef = React.useRef(onChange)
  const onRunRef = React.useRef(onRun)
  onChangeRef.current = onChange
  onRunRef.current = onRun

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onRunRef.current?.()
          return true
        }
      }
    ])

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        runKeymap,
        languageCompartment.current.of(codeMirrorLanguage(language)),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        placeholder ? placeholderExt(placeholder) : [],
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
        })
      ]
    })

    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Mount once; reactive props are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External value → editor (only when it diverges, to avoid clobbering typing).
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  // Reactive language + readOnly via compartments (no remount).
  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.current.reconfigure(codeMirrorLanguage(language))
    })
  }, [language])

  React.useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly))
    })
  }, [readOnly])

  return (
    <div
      ref={hostRef}
      data-testid="code-editor"
      className={cn(
        'h-full min-h-0 overflow-auto rounded-md border border-hairline bg-surface-0',
        'font-mono text-[13px] leading-relaxed [&_.cm-editor]:h-full [&_.cm-editor.cm-focused]:outline-none',
        className
      )}
    />
  )
}
