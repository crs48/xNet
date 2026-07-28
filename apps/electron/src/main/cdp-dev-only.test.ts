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

const mainSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8')

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
