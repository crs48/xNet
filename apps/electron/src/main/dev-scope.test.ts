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
import { describe, expect, it } from 'vitest'
import {
  BLOCK_BASE,
  BLOCK_COUNT,
  BLOCK_SIZE,
  LEGACY_PORTS,
  hashOffset,
  resolveDevScope,
  scopeEnv
} from '../../scripts/dev-scope.mjs'

const MAIN = '/Users/crs/Code/xNet/apps/electron'

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
    const scope = resolveDevScope(MAIN, {})
    expect(scope.profile).toBe('default')
    expect(scope.scoped).toBe(false)
    expect(scope.worktree).toBeNull()
    expect(scope.ports).toEqual(LEGACY_PORTS)
  })

  it('scopes a linked worktree to its own profile and block', () => {
    const scope = resolveDevScope(process.cwd(), {})
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

      const scope = resolveDevScope(MAIN, {})
      expect(scope.profile).toBe('default')
      expect(scope.scoped).toBe(false)

      // …and a real worktree is still detected through the same noise.
      expect(resolveDevScope(process.cwd(), {}).scoped).toBe(true)
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in saved)) delete process.env[key]
      }
      Object.assign(process.env, saved)
    }
  })

  it('lets an explicit profile win over the derived one', () => {
    expect(resolveDevScope(process.cwd(), { XNET_PROFILE: 'user2' }).profile).toBe('user2')
  })

  it('lets a single port override stand without abandoning the rest', () => {
    const scope = resolveDevScope(process.cwd(), { VITE_PORT: '5199' })
    expect(scope.ports.renderer).toBe(5199)
    expect(scope.ports.cdp).toBeGreaterThanOrEqual(BLOCK_BASE)
  })

  it('ignores an out-of-range port override rather than trusting it', () => {
    const scope = resolveDevScope(process.cwd(), { VITE_PORT: '70000' })
    expect(scope.ports.renderer).toBeGreaterThanOrEqual(BLOCK_BASE)
  })
})

describe('scopeEnv', () => {
  it('emits no port overrides in the main checkout', () => {
    const env = scopeEnv(resolveDevScope(MAIN, {}))
    expect(env.XNET_DEV_SCOPE).toBeTruthy()
    // Critically: no XNET_LOCAL_API_PORT. Emitting it would flatten
    // `resolveLocalAPIPort()`'s own per-profile derivation, putting `user2`
    // back onto 31415 alongside `default`.
    expect(env.XNET_LOCAL_API_PORT).toBeUndefined()
    expect(env.VITE_PORT).toBeUndefined()
    expect(env.XNET_PROFILE).toBeUndefined()
  })

  it('emits the full block for a worktree', () => {
    const scope = resolveDevScope(process.cwd(), {})
    const env = scopeEnv(scope)
    expect(env.XNET_PROFILE).toBe(scope.profile)
    expect(env.VITE_PORT).toBe(String(scope.ports.renderer))
    expect(env.ELECTRON_CDP_PORT).toBe(String(scope.ports.cdp))
    expect(env.XNET_HUB_PORT).toBe(String(scope.ports.hub))
    expect(env.XNET_LOCAL_API_PORT).toBe(String(scope.ports.localApi))
    expect(env.VITE_HUB_URL).toBe(`ws://localhost:${scope.ports.hub}`)
  })

  it('carries provenance even where nothing relocates', () => {
    const parsed = JSON.parse(scopeEnv(resolveDevScope(MAIN, {})).XNET_DEV_SCOPE)
    expect(parsed.profile).toBe('default')
    expect(parsed.scoped).toBe(false)
  })
})
