/**
 * AI provenance style (0234). Replaces the TipTap ai-generated mark: text
 * produced by AI transforms carries this style so read surfaces can badge it.
 */
import { createReactStyleSpec } from '@blocknote/react'

export const AiGeneratedStyleSpec = createReactStyleSpec(
  {
    type: 'aiGenerated',
    propSchema: 'boolean'
  },
  {
    render: (props) => (
      <span data-ai-generated="" className="ai-generated" ref={props.contentRef} />
    )
  }
)
