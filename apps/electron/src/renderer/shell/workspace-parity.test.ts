/**
 * Workspace-primitives parity guard (exploration 0280, the 0238 pattern).
 *
 * The desktop shell keeps its document-centric composition for now (0280
 * risk 6: full ShellFrame adoption is deferred, not forked). This guard
 * enforces the deferral's terms:
 *
 * 1. The canonical workspace primitives (LayoutTree, presets, payload
 *    parsing) resolve from @xnetjs/plugins in the desktop bundle — so the
 *    moment desktop adopts them it consumes the SAME module as web.
 * 2. No desktop source redefines its own preset trees or layout-tree
 *    types — the 0277 lesson: divergence starts as a copied type.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPresetTree, parseWorkspacePayload, PRESET_IDS } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'

const RENDERER_DIR = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

describe('workspace primitives parity (0280)', () => {
  it('resolves the shared preset fixtures from @xnetjs/plugins', () => {
    for (const preset of PRESET_IDS) {
      const tree = createPresetTree(preset)
      expect(tree.workspaceId).toContain(preset)
      // Round-trip through the shared payload codec — the same bytes a
      // synced workspace node carries between desktop and web.
      const parsed = parseWorkspacePayload({ name: preset, preset, tree })
      expect(parsed?.tree).toEqual(tree)
    }
  })

  it('no desktop source forks its own layout-tree or preset definitions', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(RENDERER_DIR)) {
      const source = readFileSync(file, 'utf8')
      if (/interface\s+LayoutTree\b|function\s+createPresetTree\b/.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
