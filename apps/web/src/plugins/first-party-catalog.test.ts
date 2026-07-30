/**
 * Drift guard (0290, sibling of first-party-registry.test.ts): every
 * first-party registry entry that does NOT auto-install must be installable
 * through the app — i.e. have a catalog record — and the catalog must stay
 * coherent with itself (secret config fields covered by the declared grant).
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { FIRST_PARTY_CATALOG, firstPartyManifest } from './first-party-catalog'
import type { MarketplaceListing } from '../components/marketplace-listing'

const here = dirname(fileURLToPath(import.meta.url))
const firstParty = JSON.parse(
  readFileSync(resolve(here, '../../../../registry/first-party.json'), 'utf8')
) as Array<{ id: string; name: string; version: string; autoInstalled?: boolean }>

const manualEntries = firstParty.filter((e) => e.autoInstalled === false)

describe('first-party catalog', () => {
  it('covers every registry entry that does not auto-install', () => {
    for (const entry of manualEntries) {
      expect(
        FIRST_PARTY_CATALOG[entry.id],
        `${entry.id} is listed in registry/first-party.json with autoInstalled:false but has no catalog record — it would render uninstallable`
      ).toBeDefined()
    }
  })

  it('has no catalog record without a registry entry', () => {
    const listed = new Set(firstParty.map((e) => e.id))
    for (const id of Object.keys(FIRST_PARTY_CATALOG)) {
      expect(listed.has(id), `${id} is in the catalog but not in registry/first-party.json`).toBe(
        true
      )
    }
  })

  it('covers every secret config field with the declared capability grant', () => {
    for (const [id, record] of Object.entries(FIRST_PARTY_CATALOG)) {
      const granted = record.capabilities.secrets ?? []
      for (const field of record.config ?? []) {
        if (field.kind !== 'secret') continue
        const covered = granted.some((g) =>
          g.endsWith('*') ? field.key.startsWith(g.slice(0, -1)) : g === field.key
        )
        expect(
          covered,
          `${id}: secret field ${field.key} is not covered by capabilities.secrets`
        ).toBe(true)
      }
    }
  })

  it('builds a valid pure-data manifest from a registry listing', () => {
    const entry = manualEntries[0]
    const listing: MarketplaceListing = {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      description: 'd',
      author: 'xNet',
      manifestUrl: '',
      tier: 'bundled'
    }
    const manifest = firstPartyManifest(listing)
    expect(manifest).not.toBeNull()
    expect(manifest!.id).toBe(entry.id)
    expect(manifest!.version).toBe(entry.version)
    // Pure data: survives the registry's JSON round-trip on reload.
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('returns null for unknown listings', () => {
    const listing: MarketplaceListing = {
      id: 'dev.someone.else',
      name: 'x',
      version: '1.0.0',
      description: '',
      author: 'x',
      manifestUrl: ''
    }
    expect(firstPartyManifest(listing)).toBeNull()
  })
})
