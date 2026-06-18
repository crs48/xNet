#!/usr/bin/env node
/**
 * Build the plugins marketplace index (exploration 0201).
 *
 * Merges the two committed sources under `registry/`:
 *   - first-party.json — curated built-in plugins (tier `bundled`), the same
 *     plugins that ship in the app bundle.
 *   - community.json   — the human-edited submission list: `{ repo, category }`
 *     entries pointing at author-owned GitHub repos (tier `marketplace`).
 *
 * For each community entry it enriches from the GitHub API (stars, description,
 * latest release) and points `manifestUrl` at the release's `manifest.json` —
 * the file the in-app marketplace fetches at install. Blocked repos/authors/ids
 * (registry/blocked.json) are dropped; the `revoked` list is emitted as a static
 * asset for the app to deactivate delisted plugins.
 *
 * Outputs (committed by the `plugins-registry` workflow):
 *   - registry/registry.json      — the flat marketplace index (site + app read this)
 *   - site/public/revoked.json    — delisted plugin ids + reasons
 *
 * Usage:
 *   node scripts/build-plugin-index.mjs            # write outputs
 *   node scripts/build-plugin-index.mjs --check    # fail if outputs are stale (CI)
 *
 * Network is best-effort: a community entry that can't be fetched is skipped
 * with a warning, so a transient GitHub outage never corrupts the index. Set
 * GITHUB_TOKEN to raise the API rate limit.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const registryDir = join(root, 'registry')
const check = process.argv.includes('--check')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const firstParty = readJson(join(registryDir, 'first-party.json'))
const community = readJson(join(registryDir, 'community.json'))
const blocked = readJson(join(registryDir, 'blocked.json'))

const blockedRepos = new Set(blocked.repos ?? [])
const blockedAuthors = new Set(blocked.authors ?? [])
const blockedIds = new Set(blocked.pluginIds ?? [])

/**
 * Validate the hand-edited submission sources without touching the network —
 * the PR gate. Checks community.json shape (repo `owner/name`, a category, no
 * dupes, not blocked) so a malformed submission fails before merge.
 */
function validateSources() {
  const errors = []
  if (!Array.isArray(community)) errors.push('community.json must be an array')
  const seen = new Set()
  for (const [i, e] of (Array.isArray(community) ? community : []).entries()) {
    const where = e?.repo ?? `entry ${i}`
    if (!e || typeof e !== 'object') errors.push(`${where}: must be an object`)
    else {
      if (!/^[\w.-]+\/[\w.-]+$/.test(e.repo ?? ''))
        errors.push(`${where}: repo must be "owner/name"`)
      if (!e.category) errors.push(`${where}: category is required`)
      if (seen.has(e.repo)) errors.push(`${where}: duplicate submission`)
      seen.add(e.repo)
      const owner = (e.repo ?? '').split('/')[0]
      if (blockedRepos.has(e.repo) || blockedAuthors.has(owner))
        errors.push(`${where}: repo or author is blocked`)
    }
  }
  for (const key of ['repos', 'authors', 'pluginIds', 'revoked']) {
    if (blocked[key] !== undefined && !Array.isArray(blocked[key]))
      errors.push(`blocked.json: ${key} must be an array`)
  }
  if (errors.length) {
    console.error(`plugin submission invalid (${errors.length}):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`submission sources OK: ${community.length} community entr(ies)`)
  process.exit(0)
}

if (process.argv.includes('--validate')) validateSources()

const gh = async (path) => {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'xnet-plugin-index' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(`https://api.github.com/${path}`, { headers })
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`)
  return res.json()
}

/** Enrich one community submission into a full marketplace listing. */
async function resolveCommunity(entry) {
  const { repo, category } = entry
  const owner = repo.split('/')[0]
  if (blockedRepos.has(repo) || blockedAuthors.has(owner)) {
    console.warn(`skip ${repo}: blocked`)
    return null
  }

  const meta = await gh(`repos/${repo}`)
  const release = await gh(`repos/${repo}/releases/latest`)
  const version = String(release.tag_name ?? '0.0.0').replace(/^v/, '')
  const manifestUrl = `https://github.com/${repo}/releases/latest/download/manifest.json`

  // The manifest is the source of truth for id/name; fetch it so we can dedupe
  // and reject blocked ids. Fall back to repo metadata if it isn't published yet.
  let manifest = {}
  try {
    const res = await fetch(manifestUrl, { redirect: 'follow' })
    if (res.ok) manifest = await res.json()
  } catch {
    /* best-effort */
  }

  const id = manifest.id ?? `repo.${owner}.${repo.split('/')[1]}`.toLowerCase()
  if (blockedIds.has(id)) {
    console.warn(`skip ${repo}: id ${id} blocked`)
    return null
  }

  return {
    id,
    name: manifest.name ?? meta.name,
    description: manifest.description ?? meta.description ?? '',
    version: manifest.version ?? version,
    author: manifest.author ?? owner,
    category: category ?? 'other',
    keywords: manifest.contributes ? Object.keys(manifest.contributes) : (meta.topics ?? []),
    tier: 'marketplace',
    license: manifest.license ?? meta.license?.spdx_id ?? 'MIT',
    platforms: manifest.platforms ?? ['web', 'electron'],
    contributes: manifest.contributes ? Object.keys(manifest.contributes) : undefined,
    homepage: meta.html_url,
    manifestUrl,
    pricing: manifest.pricing ?? { mode: 'free' },
    provenance: { sourceRepo: repo },
    stars: meta.stargazers_count ?? 0
  }
}

const resolved = []
for (const entry of community) {
  try {
    const listing = await resolveCommunity(entry)
    if (listing) resolved.push(listing)
  } catch (err) {
    console.warn(`skip ${entry.repo}: ${err.message}`)
  }
}

// First-party first, then community sorted by stars (the listing page re-groups
// by tier anyway; this just gives a stable, sensible default order).
resolved.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
const index = [...firstParty, ...resolved]
const revoked = blocked.revoked ?? []

const registryJson = JSON.stringify(index, null, 2) + '\n'
const revokedJson = JSON.stringify(revoked, null, 2) + '\n'
const registryPath = join(registryDir, 'registry.json')
const revokedPath = join(root, 'site', 'public', 'revoked.json')

if (check) {
  const errors = []
  if (readFileSync(registryPath, 'utf8') !== registryJson)
    errors.push('registry/registry.json is stale — run `node scripts/build-plugin-index.mjs`')
  try {
    if (readFileSync(revokedPath, 'utf8') !== revokedJson)
      errors.push('site/public/revoked.json is stale — run `node scripts/build-plugin-index.mjs`')
  } catch {
    errors.push('site/public/revoked.json is missing — run `node scripts/build-plugin-index.mjs`')
  }
  if (errors.length) {
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`plugin index up to date: ${index.length} plugins, ${revoked.length} revoked`)
} else {
  mkdirSync(dirname(revokedPath), { recursive: true })
  writeFileSync(registryPath, registryJson)
  writeFileSync(revokedPath, revokedJson)
  console.log(
    `wrote registry.json (${firstParty.length} built-in + ${resolved.length} community) and revoked.json (${revoked.length})`
  )
}
