/**
 * Inline mention chip (`@` pill). Replaces the TipTap TaskMentionExtension.
 *
 * The composer — not the reader — declares mentions (0168): hosts walk the
 * document for `mention` inline content and write the structured `mentions`
 * property; body text is never parsed for '@'.
 */
import { createReactInlineContentSpec } from '@blocknote/react'
import * as React from 'react'
import { useEditorHost } from '../host-context'

/** A person offered by the `@` picker. Shape shared with the old editor. */
export interface TaskMentionSuggestion {
  /** DID (or node id) of the person */
  id: string
  /** Display name */
  label: string
  /** Optional @handle */
  handle?: string
  /** Secondary line in the picker */
  subtitle?: string
  /** Accent color for the pill */
  color?: string
}

export function truncateDid(value: string): string {
  return value.startsWith('did:') ? `${value.slice(0, 14)}...${value.slice(-6)}` : value
}

export function getMentionDisplayLabel(item: TaskMentionSuggestion): string {
  return item.label.trim() || truncateDid(item.id)
}

export function filterMentionSuggestions(
  items: TaskMentionSuggestion[],
  query: string
): TaskMentionSuggestion[] {
  const search = query.toLowerCase().trim()
  if (!search) return items.slice(0, 8)
  return items
    .filter(
      (item) =>
        item.id.toLowerCase().includes(search) ||
        item.label.toLowerCase().includes(search) ||
        item.handle?.toLowerCase().includes(search) ||
        item.subtitle?.toLowerCase().includes(search)
    )
    .slice(0, 8)
}

function MentionChip({ id, label }: { id: string; label: string }): React.JSX.Element {
  const host = useEditorHost()
  const text = label || truncateDid(id)
  return (
    <span
      data-task-mention=""
      data-mention-id={id}
      className="task-mention cursor-pointer"
      onClick={() => host.onNavigate?.(`xnet://person/${id}`)}
    >
      @{text}
    </span>
  )
}

export const MentionInlineSpec = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      id: { default: '' },
      label: { default: '' },
      subtitle: { default: '' },
      color: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ inlineContent }) => (
      <MentionChip id={inlineContent.props.id} label={inlineContent.props.label} />
    )
  }
)
