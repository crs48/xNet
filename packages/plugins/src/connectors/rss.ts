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

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'"
}

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m)
    .trim()
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
 * Parse an RSS or Atom document into normalized entries. Defensive by design:
 * malformed or unknown markup yields fewer entries rather than throwing.
 */
export function parseFeed(xml: string): FeedEntry[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? []
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
  if (value && typeof (value as { text?: unknown }).text === 'function') {
    return (await (value as { text: () => Promise<string> }).text()) as string
  }
  return String(value ?? '')
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
