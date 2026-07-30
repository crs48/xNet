/**
 * Link up-res context (exploration 0295).
 *
 * A host app can supply a renderer that upgrades ("up-reses") a detected
 * URL into richer inline content — e.g. an internal deep link into a node
 * chip carrying the node's live title. LinkifiedText and MarkdownContent
 * consult the renderer for every http(s) link they are about to render; a
 * null return falls back to the plain anchor. Like 0171 linkification this
 * is render-time only — stored text is never rewritten.
 */
import { createContext, useContext, type ReactNode } from 'react'

export interface UpresLink {
  /** Sanitized href about to be rendered (scheme-allowlisted upstream) */
  href: string
  /** Visible text for the link (the verbatim URL for autolinked tokens) */
  text: string
}

/** Return richer content for a link, or null to keep the plain anchor. */
export type LinkUpresRenderer = (link: UpresLink) => ReactNode | null

const LinkUpresContext = createContext<LinkUpresRenderer | null>(null)

export function LinkUpresProvider({
  render,
  children
}: {
  render: LinkUpresRenderer
  children: ReactNode
}) {
  return <LinkUpresContext.Provider value={render}>{children}</LinkUpresContext.Provider>
}

/** The active up-res renderer, or null when no provider is mounted. */
export function useLinkUpres(): LinkUpresRenderer | null {
  return useContext(LinkUpresContext)
}
