/**
 * Workspace-plugin module builder (exploration 0331).
 *
 * Turns a PluginSource `files` map into a linked module graph the sandbox
 * frame can instantiate: per-file transpile (TypeScript via an injected
 * `@swc/wasm-web`-backed transpiler — the same seam Labs use), relative-import
 * resolution across the files map, and bare-import validation against the
 * pinned import map. The output is DATA (path → JS + resolved import edges);
 * nothing here executes code, and the host realm never `import()`s any of it.
 *
 * Diagnostics are structured so `plugin_build` can hand them straight to an
 * authoring agent (the generate→build→fix loop).
 */

import { isPinnedSpecifier, isRelativeSpecifier, type VendorModuleSources } from './import-map'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PluginBuildDiagnostic {
  severity: 'error' | 'warning'
  /** Source file the diagnostic is about (absent for graph-level issues). */
  file?: string
  message: string
}

/** One built module: transpiled code + its resolved import edges. */
export interface PluginBuiltModule {
  /** Normalized source path, e.g. `components/list.ts`. */
  path: string
  /** Transpiled JavaScript (ESM). */
  code: string
  /**
   * Import specifier → resolution. Relative specifiers resolve to another
   * module `path` in the graph; pinned bare specifiers resolve to themselves.
   */
  imports: Record<string, string>
}

export interface PluginModuleGraph {
  ok: boolean
  /** Normalized entry path (present when resolution succeeded). */
  entry: string
  /** Built modules keyed by normalized path. Empty when the build failed early. */
  modules: Record<string, PluginBuiltModule>
  diagnostics: PluginBuildDiagnostic[]
  durationMs: number
}

/**
 * Transpiles one source file to ESM JavaScript. `.js` files pass through
 * without one; `.ts`/`.tsx` files require it (the web app injects the lazy
 * `@swc/wasm-web` transpiler from `lab-runtime.ts`).
 */
export type PluginFileTranspiler = (code: string, path: string) => Promise<string> | string

export interface PluginBuildInput {
  files: Record<string, string>
  entry: string
  /** TypeScript/TSX transpiler. Absent → only `.js` files build. */
  transpile?: PluginFileTranspiler
  /** Host-pinned vendor modules (import-map entries beyond the defaults). */
  vendorModules?: VendorModuleSources
  /** Extra pinned bare specifiers (import-map entries served by the frame). */
  pinnedSpecifiers?: readonly string[]
}

// ─── Import scanning ───────────────────────────────────────────────────────

export interface ScannedImport {
  specifier: string
  /** Offset of the specifier's first character (inside its quotes). */
  start: number
  /** Offset one past the specifier's last character. */
  end: number
}

const IMPORT_PATTERNS = [
  // import defaultExport, { named } from 'spec'  /  import 'spec'
  /(?:^|[^.\w])import\s*(?:[\w$*\s{},]+?\s*from\s*)?(['"])([^'"\n]+)\1/g,
  // export { x } from 'spec'  /  export * from 'spec'
  /(?:^|[^.\w])export\s+[\w$*\s{},]+?\s+from\s*(['"])([^'"\n]+)\1/g,
  // import('spec')
  /(?:^|[^.\w])import\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g
]

/**
 * Scan ESM source for import/export specifiers (static, re-export, dynamic).
 * Regex-based — good for the bundleless house style; a specifier inside a
 * string literal that *looks* like an import surfaces as a diagnostic, not a
 * silent behavior change, because resolution will fail loudly.
 */
export function scanModuleImports(code: string): ScannedImport[] {
  const seen = new Map<number, ScannedImport>()
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of code.matchAll(pattern)) {
      const specifier = match[2]
      const matchText = match[0]
      const offsetInMatch = matchText.lastIndexOf(specifier)
      const start = (match.index ?? 0) + offsetInMatch
      if (!seen.has(start)) {
        seen.set(start, { specifier, start, end: start + specifier.length })
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.start - b.start)
}

// ─── Path resolution ───────────────────────────────────────────────────────

/** Normalize a plugin-source path: strip leading `./`, collapse `..` segments. */
export function normalizeSourcePath(path: string): string {
  const parts: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join('/')
}

const RESOLUTION_SUFFIXES = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js']

/** Resolve a relative specifier against the importer's directory. */
export function resolveRelativeImport(
  importerPath: string,
  specifier: string,
  files: Record<string, string>
): string | null {
  const dir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/')) : ''
  const base = normalizeSourcePath(dir ? `${dir}/${specifier}` : specifier)
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = `${base}${suffix}`
    if (candidate in files) return candidate
  }
  return null
}

// ─── Build ─────────────────────────────────────────────────────────────────

const TRANSPILED_EXTENSIONS = /\.(ts|tsx|jsx)$/

/**
 * Build the module graph for a PluginSource. Walks the import graph from
 * `entry`, transpiling and resolving as it goes. Never executes anything.
 */
export async function buildPluginModuleGraph(input: PluginBuildInput): Promise<PluginModuleGraph> {
  const started = performance.now()
  const diagnostics: PluginBuildDiagnostic[] = []
  const modules: Record<string, PluginBuiltModule> = {}

  const files: Record<string, string> = {}
  for (const [path, contents] of Object.entries(input.files)) {
    files[normalizeSourcePath(path)] = contents
  }

  const finish = (ok: boolean, entry = ''): PluginModuleGraph => ({
    ok: ok && !diagnostics.some((d) => d.severity === 'error'),
    entry,
    modules,
    diagnostics,
    durationMs: performance.now() - started
  })

  const entry = resolveRelativeImport('', `./${normalizeSourcePath(input.entry)}`, files)
  if (!entry) {
    diagnostics.push({
      severity: 'error',
      message: `Entry module not found: ${input.entry}`
    })
    return finish(false)
  }

  const queue = [entry]
  while (queue.length > 0) {
    const path = queue.shift() as string
    if (path in modules) continue

    let code = files[path]
    if (TRANSPILED_EXTENSIONS.test(path)) {
      if (!input.transpile) {
        diagnostics.push({
          severity: 'error',
          file: path,
          message: `${path} requires a TypeScript transpiler (none configured)`
        })
        continue
      }
      try {
        code = await input.transpile(code, path)
      } catch (err) {
        diagnostics.push({
          severity: 'error',
          file: path,
          message: `Transpile failed: ${err instanceof Error ? err.message : String(err)}`
        })
        continue
      }
    }

    const imports: Record<string, string> = {}
    for (const { specifier } of scanModuleImports(code)) {
      if (specifier in imports) continue
      if (isRelativeSpecifier(specifier)) {
        const resolved = resolveRelativeImport(path, specifier, files)
        if (!resolved) {
          diagnostics.push({
            severity: 'error',
            file: path,
            message: `Cannot resolve import '${specifier}' (no matching file in the source node)`
          })
          continue
        }
        imports[specifier] = resolved
        queue.push(resolved)
      } else if (isPinnedSpecifier(specifier, input.vendorModules, input.pinnedSpecifiers)) {
        imports[specifier] = specifier
      } else {
        diagnostics.push({
          severity: 'error',
          file: path,
          message:
            `Import '${specifier}' is not in the pinned import map — workspace plugins ` +
            `cannot load npm or remote code. Pinned: xnet:plugin-api` +
            (input.vendorModules ? `, ${Object.keys(input.vendorModules).join(', ')}` : '')
        })
      }
    }

    modules[path] = { path, code, imports }
  }

  const unreferenced = Object.keys(files).filter(
    (path) => !(path in modules) && /\.(ts|tsx|jsx|js)$/.test(path)
  )
  for (const path of unreferenced) {
    diagnostics.push({
      severity: 'warning',
      file: path,
      message: `${path} is not reachable from the entry module`
    })
  }

  return finish(true, entry)
}
