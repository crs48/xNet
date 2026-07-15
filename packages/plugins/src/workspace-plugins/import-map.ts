/**
 * Workspace-plugin import map (exploration 0331).
 *
 * Dependency IDENTITY is the hidden hard problem of hot-loaded plugins: the
 * host must pin exactly one copy of each shared singleton, and a plugin's bare
 * imports must resolve against that pinned set — never against the network.
 * This mirrors Patchwork's import-map trick (host-built bundles, tools mark
 * them external), except here the pinned set is also a SECURITY boundary: a
 * bare specifier outside the map is a build error, and the sandbox frame's CSP
 * (`script-src blob:`) means nothing can be fetched at runtime either.
 */

/**
 * The client plugin API every workspace plugin may import. Served by the frame
 * runtime itself (`xnet:` scheme = host-provided, never network).
 */
export const PLUGIN_API_SPECIFIER = 'xnet:plugin-api'

/** Bare specifiers pinned by default for every workspace plugin. */
export const DEFAULT_PLUGIN_IMPORT_MAP: readonly string[] = [PLUGIN_API_SPECIFIER]

/**
 * Host-supplied vendor modules: pinned bare specifier → lazily loaded module
 * source (an ESM string the frame links like any plugin module). This is how
 * the host can expose e.g. a `react` singleton to sandboxed plugins without
 * widening any CSP — the source travels over the MessagePort like plugin code.
 */
export type VendorModuleSources = Record<string, () => Promise<string> | string>

/** Is `specifier` a relative path (`./x`, `../x`)? */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

/**
 * Is `specifier` pinned by the import map (defaults + vendor modules)? Bare
 * imports that aren't pinned fail the build — there is no fallthrough to npm
 * or the network.
 */
export function isPinnedSpecifier(
  specifier: string,
  vendors?: VendorModuleSources,
  extra?: readonly string[]
): boolean {
  if (DEFAULT_PLUGIN_IMPORT_MAP.includes(specifier)) return true
  if (vendors && specifier in vendors) return true
  return extra ? extra.includes(specifier) : false
}
