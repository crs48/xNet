/**
 * @xnetjs/plugins — version compatibility (exploration 0192).
 *
 * A tiny, dependency-free semver subset — enough to gate plugin installs on the
 * host's `xnetVersion` and to detect available updates. We deliberately avoid
 * pulling in `semver` (a node-centric dep) for what is a handful of comparisons;
 * the manifest already only accepts `\d+\.\d+\.\d+`-shaped versions.
 *
 * Supported range syntax: `*` / `x` (any), exact `1.2.3`, `>=1.2.3`, `>1.2.3`,
 * `<=1.2.3`, `<1.2.3`, caret `^1.2.3`, tilde `~1.2.3`. Pre-release/build
 * metadata is ignored (compared on major.minor.patch only).
 */

export interface SemVer {
  major: number
  minor: number
  patch: number
}

/** Parse `1.2.3` (ignoring any `-pre`/`+build` suffix). Returns null if invalid. */
export function parseVersion(input: string): SemVer | null {
  const m = /^\s*v?(\d+)\.(\d+)\.(\d+)/.exec(input)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

/** Compare two versions: negative if a<b, 0 if equal, positive if a>b. */
export function compareVersions(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

/** Comparator predicates keyed by operator (default `=` for exact match). */
const OPERATORS: Record<string, (cmp: number) => boolean> = {
  '>=': (c) => c >= 0,
  '>': (c) => c > 0,
  '<=': (c) => c <= 0,
  '<': (c) => c < 0,
  '=': (c) => c === 0
}

function satisfiesOperator(version: SemVer, op: string, bound: SemVer): boolean {
  const predicate = OPERATORS[op] ?? OPERATORS['=']
  return predicate(compareVersions(version, bound))
}

/** The exclusive upper bound of a caret range: `^1.2.3`→2.0.0, `^0.2.3`→0.3.0. */
function caretUpperBound(bound: SemVer): SemVer {
  if (bound.major > 0) return { major: bound.major + 1, minor: 0, patch: 0 }
  if (bound.minor > 0) return { major: 0, minor: bound.minor + 1, patch: 0 }
  return { major: 0, minor: 0, patch: bound.patch + 1 }
}

function satisfiesCaret(version: SemVer, bound: SemVer): boolean {
  return (
    compareVersions(version, bound) >= 0 && compareVersions(version, caretUpperBound(bound)) < 0
  )
}

function satisfiesTilde(version: SemVer, bound: SemVer): boolean {
  // ~1.2.3 → >=1.2.3 <1.3.0
  if (compareVersions(version, bound) < 0) return false
  return version.major === bound.major && version.minor === bound.minor
}

/**
 * Whether `version` satisfies `range`. Unknown/unparseable ranges are treated as
 * "any" (`true`) so a missing `xnetVersion` never blocks an install; an explicit
 * but malformed bound also fails open by design (we cannot prove incompatibility).
 */
export function satisfiesRange(version: string, range: string): boolean {
  const v = parseVersion(version)
  if (!v) return false
  const trimmed = range.trim()
  if (trimmed === '' || trimmed === '*' || trimmed.toLowerCase() === 'x') return true

  const opMatch = /^(>=|<=|>|<|\^|~)?\s*(.+)$/.exec(trimmed)
  if (!opMatch) return true
  const [, op = '', rest] = opMatch
  const bound = parseVersion(rest)
  if (!bound) return true

  if (op === '^') return satisfiesCaret(v, bound)
  if (op === '~') return satisfiesTilde(v, bound)
  return satisfiesOperator(v, op, bound)
}

/**
 * Whether a plugin declaring `requiredHostRange` (its `xnetVersion`) is
 * compatible with `hostVersion`. A plugin with no declared requirement is
 * always compatible.
 */
export function isHostCompatible(
  requiredHostRange: string | undefined,
  hostVersion: string
): boolean {
  if (!requiredHostRange) return true
  return satisfiesRange(hostVersion, requiredHostRange)
}

/**
 * Whether `available` is a newer version than `installed` (a real update is
 * offerable). Returns false when either side is unparseable.
 */
export function hasUpdate(installed: string, available: string): boolean {
  const a = parseVersion(installed)
  const b = parseVersion(available)
  if (!a || !b) return false
  return compareVersions(b, a) > 0
}
