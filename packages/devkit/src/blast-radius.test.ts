import { describe, expect, it } from 'vitest'
import {
  KERNEL_PACKAGES,
  fileOf,
  isKernel,
  lane3Prompt,
  packageOf,
  resolveLane,
  workspaceOf,
  type PointedElement
} from './blast-radius'

describe('packageOf', () => {
  it('reads the package out of a repo-relative source ref', () => {
    expect(packageOf('packages/ui/src/Button.tsx:12:4')).toBe('ui')
    expect(packageOf('apps/web/src/routes/ai.tsx:3:1')).toBe('web')
  })

  it('reads the package out of an absolute path', () => {
    expect(packageOf('/Users/x/Code/xNet/packages/views/src/Grid.tsx:9:2')).toBe('views')
  })

  it('normalizes Windows separators', () => {
    expect(packageOf('packages\\sync\\src\\change.ts:1:1')).toBe('sync')
  })

  it('returns undefined rather than guessing for an unrecognized path', () => {
    expect(packageOf('scripts/build.mjs:1:1')).toBeUndefined()
    expect(packageOf(undefined)).toBeUndefined()
  })
})

describe('workspaceOf', () => {
  it('reports the root, the name, and the human-facing path', () => {
    expect(workspaceOf('packages/ui/src/Button.tsx:1:1')).toEqual({
      root: 'packages',
      name: 'ui',
      path: 'packages/ui'
    })
    expect(workspaceOf('apps/web/src/main.tsx:1:1')).toEqual({
      root: 'apps',
      name: 'web',
      path: 'apps/web'
    })
  })

  it('returns undefined outside packages/ and apps/', () => {
    expect(workspaceOf('scripts/build.mjs:1:1')).toBeUndefined()
  })
})

describe('isKernel', () => {
  it.each(KERNEL_PACKAGES)('flags packages/%s', (name) => {
    expect(isKernel({ root: 'packages', name, path: `packages/${name}` })).toBe(true)
  })

  it('does NOT flag an app that happens to share a kernel name', () => {
    // Refusing apps/sync because packages/sync is kernel would be a confusing
    // lie about where the edit would land.
    expect(isKernel({ root: 'apps', name: 'sync', path: 'apps/sync' })).toBe(false)
  })

  it('does not flag an ordinary package or an absent ref', () => {
    expect(isKernel({ root: 'packages', name: 'ui', path: 'packages/ui' })).toBe(false)
    expect(isKernel(undefined)).toBe(false)
  })
})

describe('fileOf', () => {
  it('strips the line:col suffix', () => {
    expect(fileOf('packages/ui/src/Button.tsx:12:4')).toBe('packages/ui/src/Button.tsx')
  })

  it('tolerates a ref with no position', () => {
    expect(fileOf('packages/ui/src/Button.tsx')).toBe('packages/ui/src/Button.tsx')
  })
})

describe('resolveLane', () => {
  it('routes a token-backed element to lane 1 and warns that the scope is global', () => {
    const r = resolveLane({ tokenRef: '--surface-1' })
    expect(r.lane).toBe(1)
    expect(r.scope).toBe('global')
    expect(r.allowed).toBe(true)
    expect(r.explain).toContain('--surface-1')
    // The whole point of separating lane from scope: cheapest mechanism,
    // widest reach. If this sentence stops saying so, the UI starts lying.
    expect(r.explain).toContain('whole app')
  })

  it('routes a registered slot to lane 1 with surface scope', () => {
    const r = resolveLane({ slotId: 'tasks', slotLabel: 'Tasks' })
    expect(r.lane).toBe(1)
    expect(r.scope).toBe('surface')
    expect(r.explain).toContain('Tasks')
    expect(r.explain).toContain('Undo')
  })

  it('falls back to the slot id when no label was resolved', () => {
    expect(resolveLane({ slotId: 'tasks' }).explain).toContain('tasks')
  })

  it('routes a plugin surface to lane 2', () => {
    const r = resolveLane({ pluginId: 'fyi.xnet.mermaid', pluginName: 'Mermaid' })
    expect(r.lane).toBe(2)
    expect(r.allowed).toBe(true)
    expect(r.explain).toContain('Mermaid')
    expect(r.explain).toContain('sandboxed')
  })

  it('prefers the cheapest mechanism when several owners are present', () => {
    // A token inside a plugin inside a slot is still a token change.
    const el: PointedElement = {
      tokenRef: '--accent',
      slotId: 'tasks',
      pluginId: 'fyi.xnet.mermaid',
      source: 'packages/ui/src/Button.tsx:1:1'
    }
    expect(resolveLane(el).lane).toBe(1)
    // …and without the token, the slot still beats the plugin.
    expect(resolveLane({ ...el, tokenRef: undefined }).lane).toBe(1)
    expect(resolveLane({ ...el, tokenRef: undefined, slotId: undefined }).lane).toBe(2)
  })

  it('routes ordinary source to lane 3 and promises a draft PR', () => {
    const r = resolveLane({ source: 'packages/ui/src/Button.tsx:12:4' })
    expect(r.lane).toBe(3)
    expect(r.scope).toBe('component')
    expect(r.allowed).toBe(true)
    expect(r.pkg).toBe('ui')
    expect(r.kernel).toBe(false)
    expect(r.explain).toContain('draft pull request')
    // The sentence names the workspace path, not the bare directory: "in ui"
    // reads as a guess, "in packages/ui" reads as a location.
    expect(r.explain).toContain('packages/ui')
  })

  it.each(KERNEL_PACKAGES)('refuses kernel package %s with an explanation', (pkg) => {
    const r = resolveLane({ source: `packages/${pkg}/src/index.ts:1:1` })
    expect(r.lane).toBe(3)
    expect(r.allowed).toBe(false)
    expect(r.kernel).toBe(true)
    expect(r.pkg).toBe(pkg)
    // "Loudly" means a sentence a human reads, not a silent no-op.
    expect(r.explain).toContain(`packages/${pkg}`)
    expect(r.explain.length).toBeGreaterThan(40)
  })

  it('refuses an unstamped element instead of guessing a package', () => {
    const r = resolveLane({})
    expect(r.allowed).toBe(false)
    expect(r.pkg).toBeUndefined()
    expect(r.kernel).toBeUndefined()
    expect(r.explain).toContain('no source mapping')
  })

  it('refuses a source ref outside packages/ and apps/', () => {
    expect(resolveLane({ source: 'scripts/build.mjs:1:1' }).allowed).toBe(false)
  })
})

describe('lane3Prompt', () => {
  it('carries the source location and the user instruction', () => {
    const r = resolveLane({ source: 'packages/ui/src/Button.tsx:12:4' })
    const prompt = lane3Prompt(r, 'make this paginate')
    expect(prompt).toContain('packages/ui/src/Button.tsx')
    expect(prompt).toContain('make this paginate')
    expect(prompt).toContain('Workspace: packages/ui')
  })

  it('never carries the pointed element content — the injection boundary', () => {
    // The element's rendered text is workspace content: on a shared or synced
    // workspace it was authored by someone other than the person clicking.
    // If it reached an agent with repo write access, any page would become an
    // instruction channel. The prompt builder takes a Resolution (location
    // only), so there is no field for it to leak through.
    const r = resolveLane({ source: 'packages/ui/src/Button.tsx:12:4' })
    const prompt = lane3Prompt(r, 'tidy this up')
    expect(prompt).not.toContain('ignore previous instructions')
    expect(Object.keys(r)).not.toContain('text')
  })

  it('says so plainly when no file was pointed at', () => {
    expect(lane3Prompt(resolveLane({}), 'do a thing')).toContain('did not point at a specific file')
  })
})
