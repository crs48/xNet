/**
 * Schema-extension namespace helpers.
 *
 * User- and org-defined attributes attached to a built-in (or any) schema
 * live on the node itself under a reserved, namespaced key:
 *
 *     ext:<authority>/<field>
 *
 * The `ext:` prefix is to extension overlays what the `cell_` prefix
 * (see `packages/data/src/database/cell-types.ts`) is to free-form database
 * rows: a reserved namespace that can never collide with a schema-defined
 * property. The `authority` segment — a Space id, a DID, or a domain — keeps
 * two tenants from clobbering each other's `leadScore`.
 *
 * Overlay values ride on the node as ordinary properties, so they sync and
 * conflict-resolve per-key (LWW) exactly like core properties, and they
 * inherit the node's authorization automatically.
 */

/** Reserved prefix for all extension-overlay property keys. */
export const EXT_PREFIX = 'ext:'

/**
 * An authority owns a namespace of extension fields. It must be non-empty and
 * contain no `/` (the authority/field separator). DIDs (`did:key:...`) are
 * valid authorities because they contain `:` but never `/`.
 */
const AUTHORITY_PATTERN = /^[^/\s]+$/

/** A field token is a single segment: non-empty, no `/`, no whitespace. */
const FIELD_PATTERN = /^[^/\s]+$/

/**
 * Build the namespaced property key for an extension field.
 *
 * @example
 * extKey('acme.com', 'leadScore') // => 'ext:acme.com/leadScore'
 * extKey('did:key:z6Mk…', 'notes') // => 'ext:did:key:z6Mk…/notes'
 *
 * @throws if the authority or field is malformed
 */
export function extKey(authority: string, field: string): string {
  if (!AUTHORITY_PATTERN.test(authority)) {
    throw new Error(`Invalid extension authority: ${JSON.stringify(authority)}`)
  }
  if (!FIELD_PATTERN.test(field)) {
    throw new Error(`Invalid extension field name: ${JSON.stringify(field)}`)
  }
  return `${EXT_PREFIX}${authority}/${field}`
}

/** Whether a property key belongs to the extension namespace. */
export function isExtKey(key: string): boolean {
  return parseExtKey(key) !== null
}

/**
 * Parse a namespaced extension key back into its parts.
 *
 * @returns `{ authority, field }`, or `null` if the key isn't a well-formed
 *   extension key (wrong prefix, missing separator, empty parts, etc.).
 *
 * @example
 * parseExtKey('ext:acme.com/leadScore') // => { authority: 'acme.com', field: 'leadScore' }
 * parseExtKey('ext:did:key:z6Mk…/notes') // => { authority: 'did:key:z6Mk…', field: 'notes' }
 * parseExtKey('status') // => null
 */
export function parseExtKey(key: string): { authority: string; field: string } | null {
  if (!key.startsWith(EXT_PREFIX)) return null
  const rest = key.slice(EXT_PREFIX.length)
  // The authority may contain ':' (DIDs) but never '/', and the field is the
  // single segment after the final separator — so exactly one '/' splits them.
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const authority = rest.slice(0, slash)
  const field = rest.slice(slash + 1)
  if (!AUTHORITY_PATTERN.test(authority) || !FIELD_PATTERN.test(field)) return null
  return { authority, field }
}
