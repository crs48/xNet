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
import { firstPartyRecord } from '../plugins/first-party-catalog'

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
  /** First-party plugins that are actually installed (`tier: bundled` + installed). */
  builtIn: MarketplaceListing[]
  /** Listings not yet installed (first-party or community). */
  available: MarketplaceListing[]
  /** Community listings whose id is already installed in this workspace. */
  installed: MarketplaceListing[]
}

/**
 * Split listings for display by ACTUAL install state (0290: the "Built-in"
 * label used to be assigned to every `tier: bundled` entry, including
 * first-party connectors that never auto-install — the list lied). A bundled
 * entry shows as built-in only when the plugin registry really has it; anything
 * not installed — first-party or community — is available to install.
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
    if (!installedSet.has(entry.id)) available.push(entry)
    else if (entry.tier === 'bundled') builtIn.push(entry)
    else installed.push(entry)
  }
  return { builtIn, available, installed }
}

/**
 * True when a listing can be installed from this app: either a community entry
 * with a manifest URL, or a first-party entry the app has a catalog manifest
 * for (see `plugins/first-party-catalog.ts`).
 */
export function isInstallable(entry: MarketplaceListing): boolean {
  if (firstPartyRecord(entry.id)) return true
  return (
    entry.tier !== 'bundled' && typeof entry.manifestUrl === 'string' && entry.manifestUrl !== ''
  )
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
