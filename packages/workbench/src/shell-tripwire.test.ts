/**
 * The preset tripwire (0280 risk 2): if shell components branch on which
 * preset is loaded, we have rebuilt the three-shell fork inside one
 * component. Presets must stay data-only — components read the tree's
 * axes (chrome, tiers, tabsEnabled), never the preset identity.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FORBIDDEN = [
  /\bpreset(Id)?\s*===/,
  /\bworkspaceId\s*===\s*['"`]/,
  /presetForWorkspaceId\([^)]*\)\s*===/
]

function componentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return componentFiles(path)
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : []
  })
}

describe('preset tripwire', () => {
  it('no shell component branches on the loaded preset', () => {
    const offenders: string[] = []
    for (const file of componentFiles(__dirname)) {
      const source = readFileSync(file, 'utf8')
      if (FORBIDDEN.some((pattern) => pattern.test(source))) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
