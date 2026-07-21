/**
 * The first concrete projection: a Page → `site.standard.document` card
 * (explorations 0367/0372/0380/0389).
 *
 * `site.standard.*` is the shared blogging lexicon xNet ADOPTS rather than
 * mints (0372) — Leaflet, pckt and Offprint already publish it, WordPress
 * emits it, and Bluesky renders it as a rich card. Publishing a Page as one of
 * these means the post is legible to an ecosystem xNet does not control, which
 * is the whole point of playing well with the atmosphere.
 *
 * This is a **projection**, not an incarnation (0380): the Page node is the
 * truth and the record is a lossy card. The card carries only what a reader
 * needs to decide to click — title, description, publish time, canonical URL —
 * while the body (the Yjs document, blobs, comments) stays on the hub behind
 * that URL. The write budget forces this split as much as taste does: a PDS
 * accepts ~0.46 record creates per second, so a card per publish is fine and a
 * document sync is impossible (0367).
 *
 * The `content` field is `site.standard`'s open union. We emit a single
 * `textContent` fallback here; the one `fyi.xnet.*` block xNet is entitled to
 * mint into that union (0372's adopt-and-extend) is a separate, later addition
 * — readers that understand it get fidelity, everyone else falls back to this.
 */

import type { RecordLens, LexiconRecord, NodeProperties } from '../record-lens'
import type { SchemaIRI } from '../node'

/** The adopted lexicon this Page projects to. */
export const SITE_STANDARD_DOCUMENT = 'site.standard.document'

/** Page's versioned IRI — the lens source. Kept local to avoid a schema import cycle. */
const PAGE_IRI = 'xnet://xnet.fyi/Page@1.0.0' as SchemaIRI

/**
 * Fields of `site.standard.document` this lens understands. Anything else a
 * record carries (another app's cover image, theme, custom facets) is
 * unmodelled and preserved verbatim through the extras bag — see `RecordLens`.
 */
const MODELLED = ['title', 'description', 'publishedAt', 'canonicalUrl', 'content'] as const

/** Coerce an unknown property to a trimmed string, or undefined. */
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

/**
 * The Page → site.standard.document lens.
 *
 * `forward` builds the card from materialized node state (never the change log,
 * which is a sparse per-property delta that cannot be rendered whole — 0367).
 * `backward` maps a record back to Page properties and is given the prior node
 * so xNet-only fields (space, folder, sortKey, the Yjs body) are never dropped
 * on a round trip.
 */
export const pageToDocumentLens: RecordLens = {
  lexicon: SITE_STANDARD_DOCUMENT,
  source: PAGE_IRI,
  mode: 'projection',
  lossless: false,
  modelled: MODELLED,

  forward(node: NodeProperties): LexiconRecord {
    const record: LexiconRecord = {}
    const title = str(node.title)
    if (title) record.title = title
    const description = str(node.excerpt)
    if (description) record.description = description
    const publishedAt = str(node.publishedAt)
    if (publishedAt) record.publishedAt = publishedAt
    const canonical = str(node.canonicalUrl)
    if (canonical) record.canonicalUrl = canonical
    // Open content union: a single text fallback block. `content` is where the
    // one fyi.xnet.* block will later be added (0372 adopt-and-extend).
    if (description) {
      record.content = [{ $type: `${SITE_STANDARD_DOCUMENT}.textContent`, text: description }]
    }
    return record
  },

  backward(record: LexiconRecord, priorNode?: NodeProperties): NodeProperties {
    // Start from the prior node so its xNet-only properties survive; overlay
    // only the fields this card actually carries.
    const next: NodeProperties = { ...(priorNode ?? {}) }
    const title = str(record.title)
    if (title) next.title = title
    const description = str(record.description)
    if (description) next.excerpt = description
    const publishedAt = str(record.publishedAt)
    if (publishedAt) next.publishedAt = publishedAt
    const canonical = str(record.canonicalUrl)
    if (canonical) next.canonicalUrl = canonical
    return next
  }
}
