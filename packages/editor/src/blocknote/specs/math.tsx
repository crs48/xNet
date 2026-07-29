/**
 * Inline KaTeX math. Replaces @tiptap/extension-mathematics (no BlockNote
 * built-in exists). Rendered read-only; edited via the slash menu prompt.
 *
 * KaTeX itself (~470 KB of parse) loads on the first math render, not with
 * the editor (0406 cold-open budget): documents without math never pay for
 * it, and ones with math briefly show the raw LaTeX source.
 */
import { createReactInlineContentSpec } from '@blocknote/react'
import * as React from 'react'
import { useEffect, useState } from 'react'
import 'katex/dist/katex.min.css'

type Katex = typeof import('katex').default

let katexModule: Katex | null = null
let katexLoading: Promise<Katex> | null = null

function loadKatex(): Promise<Katex> {
  katexLoading ??= import('katex').then((m) => {
    katexModule = m.default
    return m.default
  })
  return katexLoading
}

function renderLatex(latex: string): string | null {
  if (!katexModule) return null
  try {
    return katexModule.renderToString(latex, { throwOnError: false })
  } catch {
    return latex
  }
}

function InlineMath({ latex }: { latex: string }): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(() => renderLatex(latex))
  useEffect(() => {
    let alive = true
    void loadKatex().then(() => {
      if (alive) setHtml(renderLatex(latex))
    })
    return () => {
      alive = false
    }
  }, [latex])
  if (html == null) {
    return (
      <span data-inline-math="" data-latex={latex}>
        {latex}
      </span>
    )
  }
  return <span data-inline-math="" data-latex={latex} dangerouslySetInnerHTML={{ __html: html }} />
}

export const InlineMathSpec = createReactInlineContentSpec(
  {
    type: 'inlineMath',
    propSchema: {
      latex: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ inlineContent }) => <InlineMath latex={inlineContent.props.latex} />
  }
)
