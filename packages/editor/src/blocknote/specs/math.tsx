/**
 * Inline KaTeX math. Replaces @tiptap/extension-mathematics (no BlockNote
 * built-in exists). Rendered read-only; edited via the slash menu prompt.
 */
import { createReactInlineContentSpec } from '@blocknote/react'
import katex from 'katex'
import * as React from 'react'
import { useMemo } from 'react'
import 'katex/dist/katex.min.css'

function InlineMath({ latex }: { latex: string }): React.JSX.Element {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { throwOnError: false })
    } catch {
      return latex
    }
  }, [latex])
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
