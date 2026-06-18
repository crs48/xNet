/**
 * xNet plugins marketplace — the listing data for the `/plugins` page.
 *
 * Loads the committed registry index (`registry/registry.json` at the repo
 * root) — the same file the in-app marketplace fetches and the file the
 * `build-plugin-index` CI job regenerates from community submissions. The git
 * history of that file is the audit log. This mirrors the `/open` dashboard's
 * `metrics.json` pattern: a committed JSON snapshot, typed here, rendered
 * statically with build-time validation (see scripts/validate-plugins.ts).
 *
 * See exploration 0201.
 */

import registry from '../../../registry/registry.json'

/** First-party plugins ship in the monorepo and the app bundle (`bundled`);
 * community plugins are author-hosted and fetched at install (`marketplace`). */
export type PluginTier = 'bundled' | 'marketplace'

export interface PluginPricing {
  mode: 'free' | 'one-time' | 'subscription'
  amountMinor?: number
  currency?: string
}

/** A single marketplace listing — a superset of `MarketplaceEntry` from
 * `@xnetjs/plugins` (the app consumes the same file; extra fields are ignored). */
export interface PluginListing {
  id: string
  name: string
  description: string
  version: string
  author: string
  /** Coarse category for filtering (`editor`, `views`, `connector`, …). */
  category: string
  keywords?: string[]
  tier: PluginTier
  license?: string
  platforms?: ('web' | 'electron' | 'mobile')[]
  /** Contribution points the plugin extends (`views`, `slashCommands`, …). */
  contributes?: string[]
  /** Repo / docs link shown on the card and detail page. */
  homepage?: string
  /** Where the app fetches the full manifest at install (community plugins). */
  manifestUrl?: string
  pricing?: PluginPricing
  provenance?: { sourceRepo?: string; sigstoreBundleUrl?: string }
  /** Community trust signals (enriched by CI from the GitHub API). */
  stars?: number
  installs?: number
}

export const plugins = registry as PluginListing[]

export const firstParty = plugins.filter((p) => p.tier === 'bundled')
export const community = plugins.filter((p) => p.tier === 'marketplace')

/** Distinct categories present in the index, sorted for stable filter chips. */
export const categories = [...new Set(plugins.map((p) => p.category))].sort()

/** Human label for a tier (the card/detail badge). */
export function tierLabel(tier: PluginTier): string {
  return tier === 'bundled' ? 'Built-in' : 'Community'
}

/** Human price label. Free plugins (and absent pricing) read "Free". */
export function priceLabel(pricing: PluginPricing | undefined): string {
  if (!pricing || pricing.mode === 'free') return 'Free'
  const amount =
    pricing.amountMinor != null && pricing.currency
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: pricing.currency }).format(
          pricing.amountMinor / 100
        )
      : ''
  return pricing.mode === 'subscription' ? `${amount}/mo`.trim() : amount || 'Paid'
}

/** Lowercased haystack used by the client-side search filter. */
export function searchText(p: PluginListing): string {
  return [p.name, p.description, p.author, p.category, ...(p.keywords ?? [])]
    .join(' ')
    .toLowerCase()
}
