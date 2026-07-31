/**
 * The CDP remote-debugging port must never open in a production build
 * (exploration 0404).
 *
 * `src/main/index.ts` opens `--remote-debugging-port` in development so an
 * agent can drive the real app over CDP. That port is unauthenticated: anything
 * that can reach it evaluates arbitrary JavaScript in a renderer wired to
 * filesystem and SQLite IPC. The only thing standing between that and a shipped
 * binary is one `NODE_ENV === 'development'` condition.
 *
 * This asserts the guard by reading the source rather than by booting Electron:
 * the switch must be lexically inside a development-gated block, so a refactor
 * that hoists it out fails here instead of in someone's release.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const mainSource = readFileSync(join(here, 'index.ts'), 'utf8')
const preloadSource = readFileSync(join(here, '../preload/index.ts'), 'utf8')

/** Strip block and line comments so prose about the switch can't satisfy a check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('CDP remote debugging is development-only', () => {
  const code = stripComments(mainSource)

  it('sets the switch exactly once', () => {
    const matches = code.match(/appendSwitch\(\s*['"]remote-debugging-port['"]/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('sets it only inside a NODE_ENV === development block', () => {
    const index = code.indexOf("appendSwitch('remote-debugging-port'")
    expect(index).toBeGreaterThan(-1)

    // Walk back to the enclosing `if`, then require the development guard
    // between that `if` and the switch. A switch moved above the guard, or into
    // an `else`, fails.
    const before = code.slice(0, index)
    const guardStart = before.lastIndexOf('if (')
    expect(guardStart).toBeGreaterThan(-1)

    const guardToSwitch = before.slice(guardStart)
    expect(guardToSwitch).toMatch(/process\.env\.NODE_ENV\s*===\s*['"]development['"]/)
    // Nothing may close that block before the switch runs.
    expect(guardToSwitch.split('}').length - 1).toBe(0)
  })

  it('never enables it unconditionally at module scope', () => {
    for (const line of code.split('\n')) {
      if (!line.includes('remote-debugging-port')) continue
      // An indented line is inside the guard block; a flush-left one is not.
      expect(line).toMatch(/^\s+/)
    }
  })
})

/**
 * `window.__xnetDev` carries the worktree path, branch and commit an instance
 * was built from (0413). That is exactly the reconnaissance an attacker wants,
 * and it is pointless in a shipped app — nobody attaches a prototyping agent to
 * a release. Same guard as the CDP switch, asserted the same way.
 */
describe('__xnetDev provenance is development-only', () => {
  const code = stripComments(preloadSource)

  it('exposes the global exactly once', () => {
    const matches = code.match(/exposeInMainWorld\(\s*['"]__xnetDev['"]/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('exposes it only inside a NODE_ENV === development block', () => {
    const index = code.indexOf("exposeInMainWorld('__xnetDev'")
    expect(index).toBeGreaterThan(-1)

    const before = code.slice(0, index)
    const guardStart = before.lastIndexOf('if (')
    expect(guardStart).toBeGreaterThan(-1)

    const guardToExpose = before.slice(guardStart)
    expect(guardToExpose).toMatch(/process\.env\.NODE_ENV\s*===\s*['"]development['"]/)
    // Nothing may close that block before the exposure runs.
    expect(guardToExpose.split('}').length - 1).toBe(0)
  })

  it('never exposes it unconditionally at module scope', () => {
    for (const line of code.split('\n')) {
      if (!line.includes('__xnetDev')) continue
      expect(line).toMatch(/^\s+/)
    }
  })
})
