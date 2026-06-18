/**
 * Pure logic for the in-app "What's New" surface (exploration 0195).
 *
 * Reads the public JSON Feed published by the site (site/src/data/changelog.ts
 * → /changelog.json) and exposes the small helpers the hook/UI need. Kept free
 * of React and of side effects (the fetch impl is injectable) so it is unit
 * tested and the network only happens when the panel is actually opened.
 */

/** Production feed. The site is served from the same origin under xnet.fyi. */
export const CHANGELOG_FEED_URL = 'https://xnet.fyi/changelog.json'
export const CHANGELOG_PAGE_URL = 'https://xnet.fyi/changelog'

export interface ChangelogContributor {
  login: string
  name?: string
}

export interface ChangelogFeedItem {
  id: string
  url: string
  title: string
  /** Human-facing date label (from the feed's xNet extension, falls back to id). */
  date: string
  summary: string
  highlights: string[]
  tags: string[]
  image?: string
  pr?: number
  /** Everyone who contributed (PR author + commit authors), each a GitHub login. */
  authors: ChangelogContributor[]
}

interface RawFeedItem {
  id?: unknown
  url?: unknown
  title?: unknown
  content_text?: unknown
  image?: unknown
  tags?: unknown
  _xnet?: {
    date?: unknown
    summary?: unknown
    highlights?: unknown
    pr?: unknown
    authors?: unknown
    author?: unknown
  }
}

function asContributors(value: unknown, legacy: unknown): ChangelogContributor[] {
  const raw = Array.isArray(value) ? value : legacy ? [legacy] : []
  return raw
    .map((c) =>
      c && typeof (c as { login?: unknown }).login === 'string' ? (c as ChangelogContributor) : null
    )
    .filter((c): c is ChangelogContributor => c !== null)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function toItem(raw: RawFeedItem): ChangelogFeedItem | null {
  const id = asString(raw.id)
  const title = asString(raw.title)
  if (!id || !title) return null
  const ext = raw._xnet ?? {}
  return {
    id,
    url: asString(raw.url, CHANGELOG_PAGE_URL),
    title,
    date: asString(ext.date, id),
    summary: asString(ext.summary, asString(raw.content_text)),
    highlights: asStringArray(ext.highlights),
    tags: asStringArray(raw.tags),
    image: typeof raw.image === 'string' ? raw.image : undefined,
    pr: typeof ext.pr === 'number' ? ext.pr : undefined,
    authors: asContributors(ext.authors, ext.author)
  }
}

/** Parse a JSON Feed document into changelog items (newest-first, malformed dropped). */
export function parseFeed(json: unknown): ChangelogFeedItem[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  return items
    .map((raw) => toItem(raw as RawFeedItem))
    .filter((x): x is ChangelogFeedItem => x !== null)
}

/** Entries newer than the last-seen id. Ids are ISO dates, so string compare works. */
export function selectUnseen(
  items: ChangelogFeedItem[],
  lastSeenId: string | null
): ChangelogFeedItem[] {
  if (!lastSeenId) return []
  return items.filter((item) => item.id > lastSeenId)
}

export function isUnseen(item: ChangelogFeedItem, lastSeenId: string | null): boolean {
  return lastSeenId !== null && item.id > lastSeenId
}

/** Fetch + parse the changelog feed. Never throws — returns [] on any failure. */
export async function fetchChangelog(
  fetchImpl: typeof fetch = fetch,
  url: string = CHANGELOG_FEED_URL
): Promise<ChangelogFeedItem[]> {
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return []
    return parseFeed(await res.json())
  } catch {
    return []
  }
}
