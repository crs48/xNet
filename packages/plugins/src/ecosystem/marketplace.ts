/**
 * @xnetjs/plugins — marketplace index + search (exploration 0192).
 *
 * The data layer behind the 0047 GitHub-backed registry: the shape of a
 * `registry.json` entry, pure browse/search/sort over it, rating aggregation,
 * and a `MarketplaceClient` whose network access is injected (a `fetchJson`
 * port) so it is unit-testable without a server. The in-app Marketplace view
 * renders on top of this; the view itself is app-side.
 */

import type { ModuleCapabilities } from '../feature-module'
import type { PluginPricing } from '../manifest'
import type { InstallProvenance } from './provenance-trust'

/** A single entry in the marketplace index (`registry.json`). */
export interface MarketplaceEntry {
  id: string
  name: string
  description: string
  version: string
  author: string
  /** Search keywords / tags. */
  keywords?: string[]
  /** Coarse category for filtering (`productivity`, `finance`, `social`, …). */
  category?: string
  /** Capabilities the plugin requests (drives the consent preview). */
  capabilities?: ModuleCapabilities
  /** URL the full manifest is fetched from at install. */
  manifestUrl: string
  /** Lifetime install count (trust signal). */
  installs?: number
  /** GitHub stars / community signal. */
  stars?: number
  /** SPDX license id (exploration 0196) — shown as a badge; gated by CI policy. */
  license?: string
  /** Monetization (exploration 0196). Absent = free. */
  pricing?: PluginPricing
  /** Publisher identity for paid listings (exploration 0196). */
  publisherDid?: string
  /** Provenance reference for verification (see `./provenance`). */
  provenance?: { sigstoreBundleUrl?: string; sourceRepo?: string; sourceCommit?: string }
}

/** How a marketplace listing is sorted. */
export type MarketplaceSort = 'relevance' | 'installs' | 'stars' | 'name'

function matchesQuery(entry: MarketplaceEntry, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = [
    entry.name,
    entry.description,
    entry.author,
    entry.category ?? '',
    ...(entry.keywords ?? [])
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((t) => haystack.includes(t))
}

/** A relevance score for ranking; higher = better match. Name hits weigh most. */
function relevanceScore(entry: MarketplaceEntry, terms: string[]): number {
  if (terms.length === 0) return entry.installs ?? 0
  const name = entry.name.toLowerCase()
  const keywords = (entry.keywords ?? []).join(' ').toLowerCase()
  let score = 0
  for (const t of terms) {
    if (name === t) score += 100
    else if (name.includes(t)) score += 40
    if (keywords.includes(t)) score += 10
    if (entry.description.toLowerCase().includes(t)) score += 5
  }
  // Popularity as a tiebreaker (kept small so it never outweighs a text match).
  return score + Math.min(entry.installs ?? 0, 1000) / 1000
}

/** Split a query string into lowercased terms. */
function termsOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Filter an index by free-text query (name/description/keywords/author/category). */
export function searchMarketplace(
  index: readonly MarketplaceEntry[],
  query: string
): MarketplaceEntry[] {
  const terms = termsOf(query)
  return index.filter((e) => matchesQuery(e, terms))
}

type EntryComparator = (a: MarketplaceEntry, b: MarketplaceEntry) => number

/** Comparators for the non-relevance sorts (relevance needs the query terms). */
const SORTERS: Record<Exclude<MarketplaceSort, 'relevance'>, EntryComparator> = {
  installs: (a, b) => (b.installs ?? 0) - (a.installs ?? 0),
  stars: (a, b) => (b.stars ?? 0) - (a.stars ?? 0),
  name: (a, b) => a.name.localeCompare(b.name)
}

/** Sort a marketplace listing. `relevance` requires the originating `query`. */
export function sortMarketplace(
  entries: readonly MarketplaceEntry[],
  sort: MarketplaceSort,
  query = ''
): MarketplaceEntry[] {
  const terms = termsOf(query)
  const byRelevance: EntryComparator = (a, b) => relevanceScore(b, terms) - relevanceScore(a, terms)
  const comparator = sort === 'relevance' ? byRelevance : (SORTERS[sort] ?? byRelevance)
  return [...entries].sort(comparator)
}

/** Filter by category (case-insensitive); empty/undefined category returns all. */
export function filterByCategory(
  entries: readonly MarketplaceEntry[],
  category: string | undefined
): MarketplaceEntry[] {
  if (!category) return [...entries]
  const c = category.toLowerCase()
  return entries.filter((e) => (e.category ?? '').toLowerCase() === c)
}

/** A weighted signal about what the user works with (from workspace usage). */
export interface UsageSignal {
  /** A category the user engages with (e.g. `finance`). */
  category?: string
  /** A keyword the user engages with (e.g. `invoice`). */
  keyword?: string
  /** Relative strength (default 1). */
  weight?: number
}

export interface RecommendOptions {
  /** Ids already installed — excluded from recommendations. */
  installedIds?: readonly string[]
  /** Cap the number of recommendations (default 5). */
  limit?: number
}

/** How well an entry matches a single signal. */
function signalScore(entry: MarketplaceEntry, signal: UsageSignal): number {
  const weight = signal.weight ?? 1
  const cat = (signal.category ?? '').toLowerCase()
  const kw = (signal.keyword ?? '').toLowerCase()
  let score = 0
  if (cat && (entry.category ?? '').toLowerCase() === cat) score += 3 * weight
  if (kw) {
    const keywords = (entry.keywords ?? []).map((k) => k.toLowerCase())
    if (keywords.includes(kw)) score += 2 * weight
    if (entry.description.toLowerCase().includes(kw)) score += weight
  }
  return score
}

/**
 * Recommend extensions from the marketplace index for a user, given weighted
 * usage signals (category/keyword affinity). Excludes already-installed ids and
 * ranks by match score, with install-count as a tiebreaker. Pure — the "AI
 * brain" decides the signals; this turns them into a ranked shortlist.
 */
export function recommendExtensions(
  index: readonly MarketplaceEntry[],
  signals: readonly UsageSignal[],
  options: RecommendOptions = {}
): MarketplaceEntry[] {
  const installed = new Set(options.installedIds ?? [])
  const scored = index
    .filter((e) => !installed.has(e.id))
    .map((entry) => ({
      entry,
      score: signals.reduce((sum, signal) => sum + signalScore(entry, signal), 0)
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (b.entry.installs ?? 0) - (a.entry.installs ?? 0))
  return scored.slice(0, options.limit ?? 5).map((s) => s.entry)
}

/** A single rating (one node per rating; aggregated for display). */
export interface PluginRating {
  pluginId: string
  /** 1–5 stars. */
  stars: number
  authorDID: string
  review?: string
}

export interface RatingSummary {
  count: number
  average: number
  /** Histogram indexed 1..5. */
  histogram: Record<1 | 2 | 3 | 4 | 5, number>
}

type StarValue = 1 | 2 | 3 | 4 | 5

const isStarValue = (n: number): n is StarValue => n >= 1 && n <= 5

/** Aggregate ratings into a summary (rounds stars to 1..5, ignores invalid). */
export function aggregateRatings(ratings: readonly PluginRating[]): RatingSummary {
  const histogram: Record<StarValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const stars = ratings.map((r) => Math.round(r.stars)).filter(isStarValue)
  for (const s of stars) histogram[s] += 1
  const total = stars.reduce((sum, s) => sum + s, 0)
  return { count: stars.length, average: stars.length === 0 ? 0 : total / stars.length, histogram }
}

/** Injected network port so the client is testable without a real fetch. */
export type FetchJson = <T>(url: string) => Promise<T>

export interface MarketplaceClientOptions {
  /** URL of the registry index (`registry.json`). */
  indexUrl: string
  /** How to fetch JSON (defaults to `globalThis.fetch`). */
  fetchJson?: FetchJson
}

const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Marketplace fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<unknown> as never
}

/**
 * A thin client over the registry index: fetch once (cached), then browse/search
 * in memory. The marketplace stays offline-friendly — the index is small JSON.
 */
export class MarketplaceClient {
  private cache: MarketplaceEntry[] | null = null
  private readonly fetchJson: FetchJson

  constructor(private readonly options: MarketplaceClientOptions) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson
  }

  /** Fetch (and cache) the registry index. */
  async load(force = false): Promise<MarketplaceEntry[]> {
    if (this.cache && !force) return this.cache
    this.cache = await this.fetchJson<MarketplaceEntry[]>(this.options.indexUrl)
    return this.cache
  }

  /** Search + sort the index in one call. */
  async search(
    query: string,
    opts: { sort?: MarketplaceSort; category?: string } = {}
  ): Promise<MarketplaceEntry[]> {
    const index = await this.load()
    const scoped = filterByCategory(searchMarketplace(index, query), opts.category)
    return sortMarketplace(scoped, opts.sort ?? 'relevance', query)
  }
}

/** The provenance an install should pass to the registry (marketplace tier). */
export const MARKETPLACE_PROVENANCE: InstallProvenance = 'marketplace'
