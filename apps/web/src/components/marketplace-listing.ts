/**
 * Pure helpers behind the in-app plugin marketplace (exploration 0201).
 *
 * The marketplace reads the same committed `registry.json` the website renders
 * (published to the site root as `/registry.json`). A registry entry is a
 * superset of `MarketplaceEntry` — it carries a `tier` and a few display fields
 * the app ignores at the type level but uses here. Keeping the partitioning and
 * manifest fetch pure makes the React view a thin shell over tested logic.
 */

import type { MarketplaceEntry, XNetExtension } from '@xnetjs/plugins'

/** Where the app fetches the index from. Root-relative so the deployed web app
 * (served under `/app/`) reads the site-root `/registry.json`; overridable for
 * dev or a self-hosted registry. */
export const PLUGIN_REGISTRY_URL =
  (import.meta.env?.VITE_PLUGIN_REGISTRY_URL as string | undefined) ?? '/registry.json'

/** A registry listing — `MarketplaceEntry` plus the site/display fields. */
export interface MarketplaceListing extends MarketplaceEntry {
  tier?: 'bundled' | 'marketplace'
  homepage?: string
  contributes?: string[]
  license?: string
  platforms?: ('web' | 'electron' | 'mobile')[]
}

export interface PartitionedListings {
  /** First-party plugins that ship with the app (`tier: bundled`). */
  builtIn: MarketplaceListing[]
  /** Community plugins not yet installed. */
  available: MarketplaceListing[]
  /** Listings whose id is already installed in this workspace. */
  installed: MarketplaceListing[]
}

/**
 * Split listings for display: built-in (shown as "Installed/Built-in"),
 * already-installed community plugins, and installable community plugins.
 * Built-in plugins are treated as installed regardless of the registry record.
 */
export function partitionListings(
  entries: readonly MarketplaceListing[],
  installedIds: readonly string[]
): PartitionedListings {
  const installedSet = new Set(installedIds)
  const builtIn: MarketplaceListing[] = []
  const available: MarketplaceListing[] = []
  const installed: MarketplaceListing[] = []
  for (const entry of entries) {
    if (entry.tier === 'bundled') builtIn.push(entry)
    else if (installedSet.has(entry.id)) installed.push(entry)
    else available.push(entry)
  }
  return { builtIn, available, installed }
}

/** True when a listing is installable from the marketplace (community + has a manifest URL). */
export function isInstallable(entry: MarketplaceListing): boolean {
  return entry.tier !== 'bundled' && typeof entry.manifestUrl === 'string' && entry.manifestUrl !== ''
}

/** Fetch and parse a plugin manifest from its `manifestUrl`. Throws on a bad response. */
export async function fetchManifest(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<XNetExtension> {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`Could not fetch manifest (${res.status})`)
  return (await res.json()) as XNetExtension
}
