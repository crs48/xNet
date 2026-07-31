/**
 * The dev scope reader and the port-block derivation (exploration 0413).
 *
 * Two properties carry the whole design and both are easy to break silently:
 *
 *   1. **The main checkout must not move.** Every pre-0413 doc, launch entry
 *      and habit assumes 5177 / 9223 / 4444 / 31415 and the `default` profile.
 *   2. **Unknown must not render as a default.** A packaged build has no scope;
 *      if that came back as "the main checkout", an agent reading provenance
 *      would trust a value nobody set.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BLOCK_BASE,
  BLOCK_COUNT,
  BLOCK_SIZE,
  LEGACY_PORTS,
  hashOffset,
  resolveDevScope,
  scopeEnv
} from '../../scripts/dev-scope.mjs'

/**
 * A throwaway repo with a real linked worktree.
 *
 * The first version of this file resolved against the *running* checkout, which
 * passed locally (a worktree) and failed in CI (a plain clone) — the test was
 * asserting a property of the machine, not of the code. Build both shapes
 * instead, so the same assertions hold anywhere git exists.
 */
let root: string
/** A plain, non-worktree checkout — stands in for the main repo. */
let mainCheckout: string
/** A linked worktree of it. */
let worktree: string

/**
 * Scrubbed exactly like `dev-scope.mjs`'s own helper, and for the same reason:
 * run from a git hook, `GIT_DIR`/`GIT_INDEX_FILE` are exported and these
 * commands would operate on the *hook's* repository instead of the temp one.
 * (Observed: `git commit` here failed under pre-commit until this was added.)
 */
function git(args: string[], cwd: string): void {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  execFileSync('git', args, { cwd, env, stdio: 'ignore' })
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'xnet-dev-scope-'))
  mainCheckout = join(root, 'main')
  worktree = join(root, 'wt-example')

  git(['init', '-q', '-b', 'main', mainCheckout], root)
  git(['config', 'user.email', 'test@example.com'], mainCheckout)
  git(['config', 'user.name', 'xNet Test'], mainCheckout)
  git(['commit', '-q', '--allow-empty', '-m', 'root'], mainCheckout)
  git(['worktree', 'add', '-q', '-b', 'feature', worktree], mainCheckout)
})

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('port block derivation', () => {
  it('spreads whole strings across the block range', () => {
    for (const value of ['a', 'b', 'wt-one', 'wt-two']) {
      const offset = hashOffset(value)
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(BLOCK_COUNT)
    }
  })

  it('is stable across calls', () => {
    expect(hashOffset('wt-example')).toBe(hashOffset('wt-example'))
  })

  it('does not collapse strings that differ only in their final character', () => {
    // `stableProfileOffset()` would: its numeric-suffix branch maps every slug
    // ending in `6` to offset 6. Worktree slugs routinely end in a hex digit.
    const a = hashOffset('/w/agent-a7ef01abd021f6de6')
    const b = hashOffset('/w/agent-a7ef01abd021f6de5')
    expect(a).not.toBe(b)
  })

  it('keeps every derived port inside the reserved band', () => {
    const highest = BLOCK_BASE + (BLOCK_COUNT - 1) * BLOCK_SIZE + BLOCK_SIZE - 1
    expect(BLOCK_BASE).toBe(20_000)
    expect(highest).toBeLessThan(25_000)
    // Clear of every current allocation.
    for (const taken of [4321, 4394, 4444, 5173, 5219, 6006, 8081, 9223, 9225, 31415]) {
      expect(taken < BLOCK_BASE || taken > highest).toBe(true)
    }
  })
})

describe('resolveDevScope', () => {
  it('leaves the main checkout on the default profile and legacy ports', () => {
    const scope = resolveDevScope(mainCheckout, {})
    expect(scope.profile).toBe('default')
    expect(scope.scoped).toBe(false)
    expect(scope.worktree).toBeNull()
    expect(scope.ports).toEqual(LEGACY_PORTS)
  })

  it('scopes a linked worktree to its own profile and block', () => {
    const scope = resolveDevScope(worktree, {})
    expect(scope.scoped).toBe(true)
    expect(scope.profile).toMatch(/^wt-/)
    expect(scope.worktree).toBeTruthy()
    expect(scope.ports.renderer).toBeGreaterThanOrEqual(BLOCK_BASE)
    // A contiguous block, in the documented order.
    expect(scope.ports.cdp).toBe(scope.ports.renderer + 1)
    expect(scope.ports.hub).toBe(scope.ports.renderer + 2)
    expect(scope.ports.localApi).toBe(scope.ports.renderer + 3)
  })

  it('ignores inherited GIT_* variables when detecting the worktree', () => {
    // A git hook exports GIT_DIR/GIT_WORK_TREE into the *process* environment
    // and every `git` child inherits them, so `rev-parse --git-dir` answers
    // about the hook's repository rather than `cwd`'s. Unscrubbed, this
    // resolved the main checkout as a linked worktree with a bogus root —
    // under pre-commit, pre-push and CI. Hence the real `process.env` here.
    const saved = { ...process.env }
    try {
      process.env.GIT_DIR = '/Users/crs/Code/xNet/.git'
      process.env.GIT_WORK_TREE = '/Users/crs/Code/xNet'
      process.env.GIT_INDEX_FILE = '/Users/crs/Code/xNet/.git/index'

      const scope = resolveDevScope(mainCheckout, {})
      expect(scope.profile).toBe('default')
      expect(scope.scoped).toBe(false)

      // …and a real worktree is still detected through the same noise.
      expect(resolveDevScope(worktree, {}).scoped).toBe(true)
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in saved)) delete process.env[key]
      }
      Object.assign(process.env, saved)
    }
  })

  it('lets an explicit profile win over the derived one', () => {
    expect(resolveDevScope(worktree, { XNET_PROFILE: 'user2' }).profile).toBe('user2')
  })

  it('lets a single port override stand without abandoning the rest', () => {
    const scope = resolveDevScope(worktree, { VITE_PORT: '5199' })
    expect(scope.ports.renderer).toBe(5199)
    expect(scope.ports.cdp).toBeGreaterThanOrEqual(BLOCK_BASE)
  })

  it('ignores an out-of-range port override rather than trusting it', () => {
    const scope = resolveDevScope(worktree, { VITE_PORT: '70000' })
    expect(scope.ports.renderer).toBeGreaterThanOrEqual(BLOCK_BASE)
  })
})

describe('scopeEnv', () => {
  it('emits no port overrides in the main checkout', () => {
    const env = scopeEnv(resolveDevScope(mainCheckout, {}))
    expect(env.XNET_DEV_SCOPE).toBeTruthy()
    // Critically: no XNET_LOCAL_API_PORT. Emitting it would flatten
    // `resolveLocalAPIPort()`'s own per-profile derivation, putting `user2`
    // back onto 31415 alongside `default`.
    expect(env.XNET_LOCAL_API_PORT).toBeUndefined()
    expect(env.VITE_PORT).toBeUndefined()
    expect(env.XNET_PROFILE).toBeUndefined()
  })

  it('emits the full block for a worktree', () => {
    const scope = resolveDevScope(worktree, {})
    const env = scopeEnv(scope)
    expect(env.XNET_PROFILE).toBe(scope.profile)
    expect(env.VITE_PORT).toBe(String(scope.ports.renderer))
    expect(env.ELECTRON_CDP_PORT).toBe(String(scope.ports.cdp))
    expect(env.XNET_HUB_PORT).toBe(String(scope.ports.hub))
    expect(env.XNET_LOCAL_API_PORT).toBe(String(scope.ports.localApi))
    expect(env.VITE_HUB_URL).toBe(`ws://localhost:${scope.ports.hub}`)
  })

  it('carries provenance even where nothing relocates', () => {
    const parsed = JSON.parse(scopeEnv(resolveDevScope(mainCheckout, {})).XNET_DEV_SCOPE)
    expect(parsed.profile).toBe('default')
    expect(parsed.scoped).toBe(false)
  })
})
