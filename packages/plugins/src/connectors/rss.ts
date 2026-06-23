/**
 * @xnetjs/plugins — the RSS / Atom connector (exploration 0213).
 *
 * The zero-auth, hobbyist-loved integration: poll a feed URL and materialize
 * each entry as a governed `FeedItem` node through the guarded connector store.
 * The parser is dependency-free (a small, defensive RSS+Atom extractor) so the
 * package keeps its no-runtime-deps posture. `guid` carries the feed entry's
 * stable id so a host can de-duplicate across polls.
 */

import type { AgentToolContribution } from '../agent-tools'
import type { ConnectorSyncContext, DefinedConnector } from './define-connector'
import { defineConnector } from './define-connector'

export const RSS_CONNECTOR_ID = 'dev.xnet.connector.rss'
export const FEED_ITEM_SCHEMA = 'xnet://xnet.fyi/FeedItem@1.0.0'

/** One normalized feed entry (RSS `<item>` or Atom `<entry>`). */
export interface FeedEntry {
  title: string
  link?: string
  guid?: string
  summary?: string
  publishedAt?: number
}

/** Cap the parsed body so a hostile/huge feed can't pin the event loop. */
export const MAX_FEED_BYTES = 4 * 1024 * 1024
/** Cap entries materialized per poll. */
const MAX_ENTRIES = 1000

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”'
}

function fromCodePoint(code: number): string | undefined {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return undefined
  try {
    return String.fromCodePoint(code)
  } catch {
    return undefined
  }
}

/** Decode named + numeric (decimal/hex) entities in a non-CDATA text span. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
      return fromCodePoint(code) ?? m
    }
    return NAMED_ENTITIES[body] ?? m
  })
}

/**
 * Decode an extracted field. CDATA sections are emitted verbatim (XML treats
 * their content as raw text, so `&amp;` inside CDATA stays literal); only the
 * non-CDATA spans are entity-decoded.
 */
function decode(raw: string): string {
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    out += decodeEntities(raw.slice(last, m.index))
    out += m[1]
    last = re.lastIndex
  }
  out += decodeEntities(raw.slice(last))
  return out.trim()
}

/** Extract the inner text of the first `<name>...</name>` in `block`. */
function tagText(block: string, name: string): string | undefined {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block)
  return match ? decode(match[1]) : undefined
}

/** Extract a link: RSS `<link>url</link>` or Atom `<link href="url"/>`. */
function linkOf(block: string): string | undefined {
  const inline = tagText(block, 'link')
  if (inline) return inline
  const href = /<link[^>]*\shref=["']([^"']+)["'][^>]*\/?>/i.exec(block)
  return href ? decode(href[1]) : undefined
}

function dateOf(block: string): number | undefined {
  const raw = tagText(block, 'pubDate') ?? tagText(block, 'published') ?? tagText(block, 'updated')
  if (!raw) return undefined
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : undefined
}

/**
 * Find each `<item>…</item>` / `<entry>…</entry>` block by a linear, CDATA-aware
 * scan. A backtracking regex (`<(item|entry)\b[\s\S]*?<\/\1>`) is O(n²) on a feed
 * full of unclosed tags — a trivial event-loop DoS — and stops at a `</item>`
 * sitting inside a `<![CDATA[…]]>` section. indexOf-walking is linear and skips
 * CDATA when locating the close tag.
 */
function findBlocks(xml: string, tag: string, out: string[]): void {
  const lower = xml.toLowerCase()
  const open = `<${tag}`
  const close = `</${tag}>`
  let pos = 0
  while (out.length < MAX_ENTRIES) {
    const start = lower.indexOf(open, pos)
    if (start === -1) return
    const after = lower[start + open.length]
    // Require a tag boundary (`<item>`, `<item …>`, `<item/>`) — not `<items>`.
    if (
      after !== '>' &&
      after !== '/' &&
      after !== ' ' &&
      after !== '\t' &&
      after !== '\n' &&
      after !== '\r'
    ) {
      pos = start + open.length
      continue
    }
    const openEnd = xml.indexOf('>', start)
    if (openEnd === -1) return
    let scan = openEnd + 1
    let closeAt = -1
    while (scan <= xml.length) {
      const cdata = lower.indexOf('<![cdata[', scan)
      const closeIdx = lower.indexOf(close, scan)
      if (closeIdx === -1) return // unclosed → stop (don't scan forever)
      if (cdata !== -1 && cdata < closeIdx) {
        const cdataEnd = xml.indexOf(']]>', cdata + 9)
        scan = cdataEnd === -1 ? xml.length + 1 : cdataEnd + 3
        continue
      }
      closeAt = closeIdx
      break
    }
    if (closeAt === -1) return
    out.push(xml.slice(start, closeAt + close.length))
    pos = closeAt + close.length
  }
}

/**
 * Parse an RSS or Atom document into normalized entries. Defensive by design:
 * malformed or unknown markup yields fewer entries rather than throwing, and the
 * scan is linear so a hostile feed cannot pin the event loop.
 */
export function parseFeed(xml: string): FeedEntry[] {
  const input = xml.length > MAX_FEED_BYTES ? xml.slice(0, MAX_FEED_BYTES) : xml
  const blocks: string[] = []
  findBlocks(input, 'item', blocks)
  findBlocks(input, 'entry', blocks)
  const entries: FeedEntry[] = []
  for (const block of blocks) {
    const title = tagText(block, 'title')
    if (!title) continue
    const entry: FeedEntry = { title }
    const link = linkOf(block)
    if (link) entry.link = link
    const guid = tagText(block, 'guid') ?? tagText(block, 'id')
    if (guid) entry.guid = guid
    const summary =
      tagText(block, 'description') ?? tagText(block, 'summary') ?? tagText(block, 'content')
    if (summary) entry.summary = summary
    const publishedAt = dateOf(block)
    if (publishedAt !== undefined) entry.publishedAt = publishedAt
    entries.push(entry)
  }
  return entries
}

/** Read a value that may be a `fetch` Response or an already-resolved string. */
async function asText(value: unknown): Promise<string> {
  const text =
    value && typeof (value as { text?: unknown }).text === 'function'
      ? await (value as { text: () => Promise<string> }).text()
      : String(value ?? '')
  // Bound the work the parser does, regardless of how large the feed is.
  return text.length > MAX_FEED_BYTES ? text.slice(0, MAX_FEED_BYTES) : text
}

export interface RssConnectorOptions {
  /** The RSS/Atom feed URL to poll. Its host becomes the sole `network` grant. */
  feedUrl: string
  /** Override the connector id (default {@link RSS_CONNECTOR_ID}). */
  id?: string
  /** The `Feed` node id every item links back to (optional). */
  feedNodeId?: string
  /** Backing for an optional `rss_search_items` agent tool. */
  search?: (args: { query: string }) => unknown | Promise<unknown>
}

function searchTool(
  id: string,
  search: NonNullable<RssConnectorOptions['search']>
): AgentToolContribution {
  return {
    id: `${id}.search`,
    name: 'rss_search_items',
    description: 'Search entries imported from subscribed RSS/Atom feeds.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Full-text query.' } },
      required: ['query']
    },
    invoke: (args) => search({ query: String(args.query ?? '') })
  }
}

async function syncFeed(ctx: ConnectorSyncContext, options: RssConnectorOptions): Promise<number> {
  const xml = await asText(await ctx.fetch({ url: options.feedUrl }))
  let written = 0
  for (const entry of parseFeed(xml)) {
    await ctx.store.create({
      schemaId: FEED_ITEM_SCHEMA,
      properties: {
        title: entry.title,
        ...(entry.link ? { link: entry.link } : {}),
        ...(entry.guid ? { guid: entry.guid } : {}),
        ...(entry.summary ? { summary: entry.summary } : {}),
        ...(entry.publishedAt !== undefined ? { publishedAt: entry.publishedAt } : {}),
        ...(options.feedNodeId ? { feed: options.feedNodeId } : {})
      }
    })
    written++
  }
  return written
}

/**
 * Build the RSS/Atom connector. The `pull` polls one feed URL and materializes
 * its entries into `FeedItem` nodes via the guarded store.
 */
export function buildRssConnector(options: RssConnectorOptions): DefinedConnector {
  const id = options.id ?? RSS_CONNECTOR_ID
  const host = new URL(options.feedUrl).host
  const agentTools = options.search ? [searchTool(id, options.search)] : []
  return defineConnector({
    id,
    name: 'RSS / Atom',
    description: 'Poll an RSS or Atom feed and import each entry into xNet.',
    capabilities: { schemaWrite: [FEED_ITEM_SCHEMA], network: [host] },
    sync: {
      schemas: [FEED_ITEM_SCHEMA],
      cadence: { everyMs: 15 * 60_000 },
      async pull(ctx) {
        const written = await syncFeed(ctx, options)
        return { written }
      }
    },
    agentTools
  })
}
