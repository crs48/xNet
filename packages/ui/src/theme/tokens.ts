/**
 * Theme token overrides — the storage + DOM contract, without React
 * (exploration 0399).
 *
 * `ThemeProvider` uses these functions, and so can a caller that is not inside
 * it. That second entry point is load-bearing: point-and-change's inspect
 * overlay is mounted at the application ROOT so it also covers the onboarding
 * and loading screens, which means it renders outside the provider `App` sets
 * up. Reaching for `useTheme()` there threw and took the whole app down with
 * it — a debugging aid must not be able to brick the thing it inspects.
 *
 * One implementation, two entry points. There is no second store: overrides are
 * keyed by custom-property name, applied as inline properties on `:root` (where
 * the cascade already looks them up), and persisted under the provider's
 * storage key.
 */

/** Per-token value overrides, keyed by custom-property name (`--surface-1`). */
export type TokenOverrides = Record<string, string>

/** The localStorage key overrides live under, derived from the theme's key. */
export function tokenStorageKey(storageKey: string): string {
  return `${storageKey}-tokens`
}

/**
 * Read persisted overrides.
 *
 * A malformed value reads as NO overrides rather than a partial theme, and
 * entries that are not `--token: string` pairs are dropped — "unreadable" and
 * "absent" must not be distinguishable only by what happens to render.
 */
export function readTokenOverrides(storageKey: string): TokenOverrides {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(tokenStorageKey(storageKey))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([name, value]) => name.startsWith('--') && typeof value === 'string'
      )
    ) as TokenOverrides
  } catch {
    return {}
  }
}

/** Persist overrides. Silent on storage failure (incognito, quota). */
export function writeTokenOverrides(storageKey: string, overrides: TokenOverrides): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(tokenStorageKey(storageKey), JSON.stringify(overrides))
  } catch {
    // Silent fail — an unpersisted override is still applied for this session.
  }
}

/**
 * Apply `overrides` to `:root`, removing any of `previouslyApplied` that are no
 * longer present.
 *
 * Scoped removal rather than a blanket clear: two providers (or a provider and
 * the overlay) can coexist without one wiping properties the other set.
 * Returns the names now applied, to pass back as `previouslyApplied` next time.
 */
export function applyTokenOverrides(
  overrides: TokenOverrides,
  previouslyApplied: readonly string[] = []
): string[] {
  if (typeof document === 'undefined') return []
  const root = document.documentElement
  for (const name of previouslyApplied) {
    if (!(name in overrides)) root.style.removeProperty(name)
  }
  for (const [name, value] of Object.entries(overrides)) {
    root.style.setProperty(name, value)
  }
  return Object.keys(overrides)
}

/**
 * Set one token, persisting and applying it. Returns the new override map.
 *
 * Usable with no React in scope — this is the entry point the inspect overlay
 * uses.
 */
export function setThemeToken(storageKey: string, name: string, value: string): TokenOverrides {
  const current = readTokenOverrides(storageKey)
  const next = { ...current, [name]: value }
  writeTokenOverrides(storageKey, next)
  applyTokenOverrides(next, Object.keys(current))
  return next
}

/**
 * Drop one override, restoring the stylesheet's value.
 *
 * Deliberately distinct from setting the token back to its computed value: an
 * inline copy would shadow the stylesheet forever and stop following theme and
 * variant changes.
 */
export function clearThemeToken(storageKey: string, name: string): TokenOverrides {
  const current = readTokenOverrides(storageKey)
  const next = { ...current }
  delete next[name]
  writeTokenOverrides(storageKey, next)
  applyTokenOverrides(next, Object.keys(current))
  return next
}

/** Drop every override. */
export function clearThemeTokens(storageKey: string): TokenOverrides {
  const current = readTokenOverrides(storageKey)
  writeTokenOverrides(storageKey, {})
  applyTokenOverrides({}, Object.keys(current))
  return {}
}
