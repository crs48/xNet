/**
 * The dev scope, as the main process sees it (0413).
 *
 * This is a **reader**, not a resolver. `scripts/dev-scope.mjs` derives the
 * profile, port block and git provenance exactly once — in the dev launcher —
 * and passes the result down as `XNET_DEV_SCOPE`. The main process parses it
 * and nothing more, so there is one place where "which worktree is this?" is
 * decided and no way for a changed cwd to make the answer drift mid-run.
 *
 * Absent or unparseable, every field is `null` and `scoped` is false. That is
 * the honest answer for a packaged build and for `electron-vite dev` invoked
 * directly: **"we do not know"** must not be renderable as "the main checkout",
 * because an agent reading provenance would then trust a value nobody set.
 */

export interface DevScopePorts {
  renderer: number
  cdp: number
  hub: number
  localApi: number
}

export interface DevScope {
  profile: string | null
  scoped: boolean
  worktree: string | null
  branch: string | null
  commit: string | null
  ports: DevScopePorts | null
}

const UNKNOWN: DevScope = Object.freeze({
  profile: null,
  scoped: false,
  worktree: null,
  branch: null,
  commit: null,
  ports: null
})

function parse(raw: string | undefined): DevScope {
  if (!raw) return UNKNOWN
  try {
    const value = JSON.parse(raw) as Partial<DevScope>
    if (!value || typeof value !== 'object') return UNKNOWN
    return {
      profile: typeof value.profile === 'string' ? value.profile : null,
      scoped: value.scoped === true,
      worktree: typeof value.worktree === 'string' ? value.worktree : null,
      branch: typeof value.branch === 'string' ? value.branch : null,
      commit: typeof value.commit === 'string' ? value.commit : null,
      ports: isPorts(value.ports) ? value.ports : null
    }
  } catch {
    return UNKNOWN
  }
}

function isPorts(value: unknown): value is DevScopePorts {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (['renderer', 'cdp', 'hub', 'localApi'] as const).every(
    (key) => typeof candidate[key] === 'number' && Number.isInteger(candidate[key])
  )
}

/** The scope this process was launched with. Resolved once, at module load. */
export const devScope: DevScope = parse(process.env.XNET_DEV_SCOPE)

/**
 * The window-title suffix for this instance.
 *
 * Always non-empty in development: the pre-0413 title was plain `xNet` for the
 * `default` profile, which made the documented "check the title bar to see
 * which instance you attached to" mitigation useless in precisely the case it
 * existed to catch — two `default` instances racing for the same port.
 */
export function titleSuffix(profile: string): string {
  const commit = devScope.commit ? ` @${devScope.commit}` : ''
  return `${profile}${commit}`
}
