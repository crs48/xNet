/**
 * Inline wikilink chip (`[[` typeahead, 0170). Replaces the TipTap Wikilink
 * mark + WikilinkSuggestionExtension. A wikilink is now atomic inline
 * content (a chip) rather than a mark over editable text — breaking, but
 * simpler and consistent with mentions/hashtags.
 */
import { createReactInlineContentSpec } from '@blocknote/react'
import { useEntangleBind, useEntangledHighlight } from '@xnetjs/react'
import * as React from 'react'
import { useEditorHost } from '../host-context'

/** Sentinel id for the trailing "create page" menu entry. */
export const CREATE_WIKILINK_ID = '__create-wikilink__'

export interface WikilinkTarget {
  /** wikilink href: page node id, or xnet://<type>/<id> */
  href: string
  /** Node title shown as the default link text */
  title: string
  /** Node kind shown in the menu ('page' | 'database' | …) */
  kind: string
}

export interface WikilinkQueryParts {
  search: string
  alias: string | null
}

/** Split a raw `[[` query on the first '|' (Obsidian alias syntax). */
export function parseWikilinkQuery(query: string): WikilinkQueryParts {
  const pipe = query.indexOf('|')
  if (pipe === -1) return { search: query.trim(), alias: null }
  return { search: query.slice(0, pipe).trim(), alias: query.slice(pipe + 1).trim() || null }
}

/** Prefix matches first, then substring matches, capped. */
export function matchWikilinkTargets(
  targets: WikilinkTarget[],
  search: string,
  cap = 8
): WikilinkTarget[] {
  const q = search.toLowerCase().trim()
  if (!q) return targets.slice(0, cap)
  const prefix = targets.filter((t) => t.title.toLowerCase().startsWith(q))
  const substring = targets.filter(
    (t) => !t.title.toLowerCase().startsWith(q) && t.title.toLowerCase().includes(q)
  )
  return [...prefix, ...substring].slice(0, cap)
}

/** The node id a wikilink points at (strips the xnet://<type>/ scheme). */
function wikilinkNodeId(href: string): string | null {
  if (!href) return null
  const match = href.match(/^xnet:\/\/[a-z]+\/(.+)$/)
  return match ? match[1] : href
}

function WikilinkChip({ href, title }: { href: string; title: string }): React.JSX.Element {
  const host = useEditorHost()
  // Entangle bus (0346): the chip lights up when its target is hovered
  // in a sibling frame (map pin, grid row) and publishes its own hover.
  const nodeId = wikilinkNodeId(href)
  const entangleBind = useEntangleBind(nodeId)
  const entangled = useEntangledHighlight(nodeId)
  return (
    <a
      data-wikilink=""
      href={href}
      className={
        entangled
          ? 'wikilink cursor-pointer rounded-sm bg-amber-200/60 dark:bg-amber-500/25'
          : 'wikilink cursor-pointer'
      }
      onClick={(event) => {
        event.preventDefault()
        host.onNavigate?.(href)
      }}
      {...entangleBind}
    >
      {title}
    </a>
  )
}

export const WikilinkInlineSpec = createReactInlineContentSpec(
  {
    type: 'wikilink',
    propSchema: {
      href: { default: '' },
      title: { default: '' }
    },
    content: 'none'
  },
  {
    render: ({ inlineContent }) => (
      <WikilinkChip href={inlineContent.props.href} title={inlineContent.props.title} />
    )
  }
)
