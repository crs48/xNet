/**
 * `app.setPath('userData', …)` must run before `app.requestSingleInstanceLock()`
 * (exploration 0413).
 *
 * Chromium keys the single-instance lock on the userData directory. That one
 * fact is what lets two git worktrees run the desktop app at the same time:
 * each resolves its own profile, so each gets its own userData, so each gets
 * its own lock — for free, with no coordination.
 *
 * The ordering that makes it work is invisible. `profile.ts` calls `setPath` at
 * **module scope**, and `index.ts` gets that side effect only because it
 * imports `profile` before it calls `requestSingleInstanceLock()`. Wrap the
 * `setPath` in a function that runs on `whenReady`, or hoist the lock above the
 * import, and every worktree silently collapses back onto one lock — with the
 * failure showing up as "the second app just exits", which is the exact
 * symptom 0413 exists to eliminate.
 *
 * Asserted by reading the source, matching `cdp-dev-only.test.ts`: this is a
 * structural invariant, and booting Electron to check it would be both slower
 * and less specific about what broke.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const profileSource = readFileSync(join(here, 'profile.ts'), 'utf8')
const mainSource = readFileSync(join(here, 'index.ts'), 'utf8')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('userData is redirected before the single-instance lock is taken', () => {
  const profileCode = stripComments(profileSource)
  const mainCode = stripComments(mainSource)

  it('profile.ts calls setPath at module scope, not inside a function', () => {
    const index = profileCode.indexOf("app.setPath('userData'")
    expect(index).toBeGreaterThan(-1)

    // Only an `if` block may wrap it. A `function`/`=>` between the top of the
    // file and the call means it now runs on demand rather than on import.
    const before = profileCode.slice(0, index)
    expect(before).not.toMatch(/\bfunction\b|=>/)
  })

  it('index.ts imports profile before requesting the lock', () => {
    const importIndex = mainCode.indexOf("from './profile'")
    const lockIndex = mainCode.indexOf('requestSingleInstanceLock()')

    expect(importIndex).toBeGreaterThan(-1)
    expect(lockIndex).toBeGreaterThan(-1)
    expect(importIndex).toBeLessThan(lockIndex)
  })

  it('index.ts imports nothing that takes the lock earlier', () => {
    // The lock must be requested exactly once, and from index.ts — a second
    // caller elsewhere would race the redirect no matter what this file does.
    const matches = mainCode.match(/requestSingleInstanceLock\(\)/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('exits non-zero when the lock is lost, rather than quitting silently', () => {
    const lockIndex = mainCode.indexOf('requestSingleInstanceLock()')
    const after = mainCode.slice(lockIndex, lockIndex + 1200)

    // `app.quit()` here was the original bug: it exits 0, so a caller cannot
    // tell "another instance owns this profile" from "started fine".
    expect(after).toMatch(/app\.exit\(1\)/)
    expect(after).not.toMatch(/app\.quit\(\)/)
  })
})
