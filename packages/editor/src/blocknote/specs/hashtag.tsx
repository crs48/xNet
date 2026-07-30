/**
 * Inline hashtag pill (`#` picker, 0169). Replaces the TipTap HashtagExtension.
 */
import { createReactInlineContentSpec } from '@blocknote/react'
import * as React from 'react'
import { useEditorHost } from '../host-context'

/** Sentinel id for the trailing "create new tag" menu entry. */
export const CREATE_HASHTAG_ID = '__create-hashtag__'

export interface HashtagSuggestion {
  /** Tag node id */
  id: string
  /** Normalized tag name (no leading '#') */
  name: string
}

export function filterHashtagSuggestions(
  items: HashtagSuggestion[],
  query: string,
  cap = 8
): HashtagSuggestion[] {
  const search = query.toLowerCase().trim()
  if (!search) return items.slice(0, cap)
  const prefix = items.filter((t) => t.name.toLowerCase().startsWith(search))
  const substring = items.filter(
    (t) => !t.name.toLowerCase().startsWith(search) && t.name.toLowerCase().includes(search)
  )
  return [...prefix, ...substring].slice(0, cap)
}

function HashtagChip({ id, name }: { id: string; name: string }): React.JSX.Element {
  const host = useEditorHost()
  return (
    <span
      data-hashtag=""
      data-tag-id={id}
      className="hashtag-pill cursor-pointer"
      onClick={() => host.onNavigate?.(`xnet://tag/${id}`)}
    >
      #{name}
    </span>
  )
}

export const HashtagInlineSpec = createReactInlineContentSpec(
  {
    type: 'hashtag',
    propSchema: {
      id: { default: '' },
      name: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ inlineContent }) => (
      <HashtagChip id={inlineContent.props.id} name={inlineContent.props.name} />
    )
  }
)
