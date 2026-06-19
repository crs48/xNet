/**
 * Drift guard (explorations 0201 + 0206): every plugin that ships in the app
 * bundle (BUNDLED_PLUGINS) must be catalogued in registry/first-party.json as a
 * `bundled` entry, so the website's "Built in" list never lies about what the
 * app actually ships.
 *
 * 0206 additionally enforces auto-install honesty: an entry that claims to
 * auto-install (`autoInstalled !== false`) MUST be in BUNDLED_PLUGINS, and an
 * entry flagged `autoInstalled: false` (a first-party connector/library you set
 * up explicitly) MUST NOT be — so the catalog can never imply unmounted code
 * runs on its own.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { BUNDLED_PLUGINS } from './index'

const here = dirname(fileURLToPath(import.meta.url))
const firstParty = JSON.parse(
  readFileSync(resolve(here, '../../../../registry/first-party.json'), 'utf8')
) as Array<{ id: string; tier: string; autoInstalled?: boolean }>

const bundledIds = new Set(BUNDLED_PLUGINS.map((p) => p.id))

describe('first-party registry', () => {
  it('lists every bundled plugin', () => {
    const listed = new Set(firstParty.map((e) => e.id))
    for (const plugin of BUNDLED_PLUGINS) {
      expect(listed.has(plugin.id), `${plugin.id} missing from registry/first-party.json`).toBe(
        true
      )
    }
  })

  it('marks first-party entries as bundled', () => {
    for (const entry of firstParty) {
      expect(entry.tier).toBe('bundled')
    }
  })

  it('only auto-installs entries that are actually bundled', () => {
    for (const entry of firstParty) {
      const claimsAutoInstall = entry.autoInstalled !== false
      expect(
        claimsAutoInstall === bundledIds.has(entry.id),
        claimsAutoInstall
          ? `${entry.id} claims auto-install (autoInstalled !== false) but is not in BUNDLED_PLUGINS`
          : `${entry.id} is flagged autoInstalled:false but is in BUNDLED_PLUGINS`
      ).toBe(true)
    }
  })
})
