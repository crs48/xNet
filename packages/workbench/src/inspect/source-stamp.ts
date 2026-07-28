/**
 * Pure logic for the point-and-change source stamp (exploration 0399).
 *
 * Browser-side half of the stamp: the dev JSX runtime shim next door calls
 * `stampProps`, and the inspect overlay reads `SOURCE_ATTR`. The Vite wiring
 * lives in `vite-plugins/source-stamp.ts` and deliberately shares NO import
 * with this file — that directory is a separate `composite` TypeScript project,
 * and an import either way makes one project demand built declarations of the
 * other.
 *
 * ## Why a runtime shim rather than a Babel plugin
 *
 * The obvious implementation — a Babel visitor pushing a JSX attribute — cannot
 * work in this app. `@vitejs/plugin-react` does NOT transform JSX itself under
 * the automatic runtime; Vite's esbuild pass does, earlier in the pipeline. By
 * the time plugin-react runs Babel, every `<div>` is already a `jsxDEV(...)`
 * call and a `JSXOpeningElement` visitor never fires. (Verified against
 * plugin-react 4.7: its Babel run only adds react-refresh and, for the classic
 * runtime, jsx-self/jsx-source.)
 *
 * So instead we intercept the thing esbuild already computed. In dev it emits
 * `jsxDEV(type, props, key, isStatic, source)` where `source` is
 * `{ fileName, lineNumber, columnNumber }`. Pointing `jsxImportSource` at a
 * shim lets us read that argument and fold it into `props` — no AST work, and
 * no dependency on React storing it.
 *
 * That last part matters: React's `_debugSource` fiber field carries the same
 * information and is REMOVED IN REACT 19. We read the argument before React
 * sees it, so the overlay survives that upgrade.
 *
 * DEV ONLY, gated on Vite's `command` in `vite.config.ts`. A production bundle
 * carrying these attributes would publish the source-tree layout to every
 * visitor; `scripts/guard-no-source-stamp.mjs` fails CI if one ever does.
 */

/** The attribute the overlay reads. Exported so the guard and the overlay agree. */
export const SOURCE_ATTR = 'data-xnet-src'

/** What esbuild hands `jsxDEV` as its `source` argument. */
export interface JsxSource {
  fileName?: string
  lineNumber?: number
  columnNumber?: number
}

/**
 * Whether this element should be stamped.
 *
 * Host elements only — a string type is a real DOM node, so the attribute
 * survives to the browser. A component (function/class) or a Fragment (symbol)
 * would receive it as an unexpected prop that gets spread somewhere arbitrary
 * or dropped, which is useless and noisy.
 */
export function shouldStamp(type: unknown, props: unknown): boolean {
  if (typeof type !== 'string' || type.length === 0) return false
  const first = type[0]
  if (first !== first.toLowerCase() || first === first.toUpperCase()) return false
  if (!props || typeof props !== 'object') return false
  return !(SOURCE_ATTR in (props as Record<string, unknown>))
}

/**
 * Trim an absolute path down to its repo-relative form.
 *
 * Done by locating the `packages/` or `apps/` segment rather than by comparing
 * against an injected root: the shim runs in the browser where the repo root is
 * not known, and `resolveLane()` parses the package out of exactly these
 * prefixes anyway. The LAST occurrence wins so a checkout that itself lives
 * under a directory called `apps` still resolves correctly.
 */
export function repoRelative(fileName: string): string {
  const path = fileName.replace(/\\/g, '/')
  let best = -1
  for (const segment of ['/packages/', '/apps/']) {
    best = Math.max(best, path.lastIndexOf(segment))
  }
  return best === -1 ? path : path.slice(best + 1)
}

/** Build the attribute value, or `undefined` when the source is unusable. */
export function formatSource(source: JsxSource | undefined): string | undefined {
  if (!source?.fileName) return undefined
  const line = source.lineNumber ?? 0
  const column = source.columnNumber ?? 0
  return `${repoRelative(source.fileName)}:${line}:${column}`
}

/**
 * Return props with the source attribute folded in.
 *
 * Copies rather than mutating — the props object may be shared (a hoisted
 * static element is created once and reused across renders), and mutating it
 * would stamp every reuse with whichever call site rendered first. Returns the
 * ORIGINAL object when there is nothing to add, so the common path allocates
 * nothing.
 */
export function stampProps<P>(type: unknown, props: P, source: JsxSource | undefined): P {
  if (!shouldStamp(type, props)) return props
  const value = formatSource(source)
  if (!value) return props
  return { ...(props as Record<string, unknown>), [SOURCE_ATTR]: value } as P
}
