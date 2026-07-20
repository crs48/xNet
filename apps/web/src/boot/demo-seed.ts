/**
 * First-visit demo seed for the landing-page "Try the app" CTA (exploration
 * 0384). The site links to /app?demo=1; boot captures that signal into
 * sessionStorage (and strips the param), and once the store is ready
 * `maybeRunDemoSeed` populates the curated LANDING_SEED_PROFILE.
 *
 * Guard: the seed runs ONLY when the profile has no user content. Nodes in
 * infrastructure schemas (the seed's own excluded system/meta set, plus the
 * bundled-plugin install records every fresh profile gets) don't count — but
 * a single node in any other schema vetoes the seed, so a returning user's
 * workspace is never auto-seeded, even if they follow a /app?demo=1 link.
 */
import type { NodeStore, SchemaIRI } from '@xnetjs/data'
import { PluginSchema } from '@xnetjs/plugins'

export const DEMO_SEED_PARAM = 'demo'

const PENDING_KEY = 'xnet:demo-seed-pending'

/**
 * Read the demo signal from the page URL at boot, persist it to
 * sessionStorage, and strip the param from the address bar. Persisting (rather
 * than holding it in memory) keeps the intent alive across the reload a user
 * might do mid-onboarding, while staying scoped to this tab.
 *
 * Mirrors hub-session.ts: under hash routing the route query lives inside the
 * fragment (e.g. /app/#/?demo=1), so both locations are checked.
 */
export function captureDemoSeedSignalFromLocation(): void {
  try {
    const parsed = new URL(window.location.href)
    const [hashPath, hashQuery = ''] = parsed.hash.split('?')
    const hashParams = new URLSearchParams(hashQuery)
    const demo = parsed.searchParams.get(DEMO_SEED_PARAM) ?? hashParams.get(DEMO_SEED_PARAM)
    if (demo === null) return

    sessionStorage.setItem(PENDING_KEY, '1')
    parsed.searchParams.delete(DEMO_SEED_PARAM)
    hashParams.delete(DEMO_SEED_PARAM)
    const hash = hashParams.size > 0 ? `${hashPath}?${hashParams.toString()}` : hashPath
    window.history.replaceState({}, '', `${parsed.pathname}${parsed.search}${hash}`)
  } catch {
    // URL or sessionStorage unavailable — no demo seed.
  }
}

export function demoSeedPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export function clearDemoSeedPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * Does the store hold anything a user (or an earlier seed) put there?
 * Infrastructure schemas in `ignoredSchemaIds` are discounted; everything
 * else counts as user content.
 */
export async function hasExistingUserContent(
  store: NodeStore,
  ignoredSchemaIds: ReadonlySet<string>
): Promise<boolean> {
  const adapter = store.getStorageAdapter()
  const total = await adapter.countNodes()
  if (total === 0) return false

  let infrastructure = 0
  for (const schemaId of ignoredSchemaIds) {
    infrastructure += await adapter.countNodes({ schemaId: schemaId as SchemaIRI })
    if (infrastructure >= total) return false
  }
  return total > infrastructure
}

export type DemoSeedOutcome = 'seeded' | 'skipped-existing-data' | 'not-requested'

/**
 * Run the landing demo seed if (and only if) it was requested via the URL and
 * the profile is fresh. The pending flag is cleared on both outcomes so the
 * decision is made once per demo entry; a thrown seed error leaves it set,
 * letting a reload retry (the seed is idempotent).
 */
export async function maybeRunDemoSeed(store: NodeStore): Promise<DemoSeedOutcome> {
  if (!demoSeedPending()) return 'not-requested'

  // Loaded on demand: the seed module (fixture prose included) stays out of
  // the main chunk for the overwhelmingly common no-demo boot.
  const { runSeed, LANDING_SEED_PROFILE, SEED_EXCLUDED_SCHEMA_IDS } =
    await import('@xnetjs/devtools/seed')
  const ignored = new Set<string>([...SEED_EXCLUDED_SCHEMA_IDS, PluginSchema._schemaId])

  if (await hasExistingUserContent(store, ignored)) {
    clearDemoSeedPending()
    return 'skipped-existing-data'
  }

  await runSeed({ store, ...LANDING_SEED_PROFILE })
  clearDemoSeedPending()
  return 'seeded'
}
