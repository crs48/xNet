/**
 * Drift guard (exploration 0201): every plugin that ships in the app bundle
 * (BUNDLED_PLUGINS) must be catalogued in registry/first-party.json as a
 * `bundled` entry, so the website's "Built in" list never lies about what the
 * app actually ships.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { BUNDLED_PLUGINS } from './index'

const here = dirname(fileURLToPath(import.meta.url))
const firstParty = JSON.parse(
  readFileSync(resolve(here, '../../../../registry/first-party.json'), 'utf8')
) as Array<{ id: string; tier: string }>

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
})
