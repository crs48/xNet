/**
 * Document format constants (0312) — pure module, safe for the
 * framework-agnostic root entry.
 */

/**
 * Document schema version. v4 = BlockNote block schema in the
 * `content-v4` fragment; v3 and below were TipTap/ProseMirror schemas in
 * the `content` fragment and are import-only legacy (0312).
 */
export const EDITOR_DOCUMENT_SCHEMA_VERSION = 4

/** The Y.XmlFragment field that holds v4 (BlockNote) documents. */
export const EDITOR_DOCUMENT_FRAGMENT_FIELD = 'content-v4'

/** The legacy TipTap fragment field, read only by the lazy importer. */
export const LEGACY_DOCUMENT_FRAGMENT_FIELD = 'content'
