/**
 * Projection lexicons (explorations 0367/0372/0380/0389).
 *
 * Concrete `RecordLens` mappings from xNet schemas onto adopted foreign
 * lexicons, plus a one-call registration so a consumer wires the whole set into
 * a `RecordLensRegistry` without importing each lens by hand.
 */

import type { RecordLensRegistry } from '../record-lens'
import { pageToDocumentLens, SITE_STANDARD_DOCUMENT } from './page-document'

export {
  pageToDocumentLens,
  SITE_STANDARD_DOCUMENT,
  XNET_BODY_BLOCK,
  type XNetBodyBlock
} from './page-document'

/** Every built-in projection lens, in registration order. */
export const BUILTIN_RECORD_LENSES = [pageToDocumentLens] as const

/**
 * Register the built-in projection lenses into a registry.
 *
 * Kept separate from the module-level `recordLensRegistry` singleton so tests
 * and alternate hosts can register into a fresh registry; the singleton is
 * populated by whichever runtime wants the defaults.
 */
export function registerBuiltinRecordLenses(registry: RecordLensRegistry): void {
  for (const lens of BUILTIN_RECORD_LENSES) registry.register(lens)
}
