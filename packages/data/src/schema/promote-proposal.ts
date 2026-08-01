/**
 * Late ontology — propose graduating an accumulated overlay key into a core
 * schema property (exploration 0426).
 *
 * Schema-first tools make you name the shape of your data before you have any,
 * which prematurely constrains what could have emerged. The alternative is not
 * "no schemas"; it is **late** schemas: capture without a decision, let overlay
 * keys accumulate, and once the shape is visible, offer to name it.
 *
 * Everything here returns a *proposal*. Nothing mutates, nothing is inferred
 * silently, and the lens it hands back is reversible by construction — its
 * `backward()` restores the overlay key, so accepting a promotion is undoable.
 * A promotion you can back out of is a suggestion; one you cannot is the app
 * deciding what your data means.
 */
import { parseExtKey } from './extension'
import { composeLens, promoteOverlay } from './lens-builders'
import type { SchemaLens } from './lens'
import type { SchemaIRI } from './node'

/**
 * How many rows must carry an overlay key before promoting it is worth
 * suggesting. Deliberately conservative: a suggestion that fires early is the
 * app telling you what your data means, which is the thing this module exists
 * to avoid.
 */
export const DEFAULT_PROMOTION_THRESHOLD = 8

export interface PromotionProposal {
  /** The overlay key that would be promoted, e.g. `ext:local/dueDate`. */
  overlayKey: string
  /** Authority segment of the overlay key, e.g. `local`. */
  authority: string
  /** The core property name it would become, e.g. `dueDate`. */
  field: string
  /** How many of the supplied rows carry the key. */
  count: number
  /** Rows carrying the key, as a fraction of all rows supplied (0..1). */
  coverage: number
  /** Reversible lens; `backward()` restores the overlay key. */
  lens: SchemaLens
}

export interface ProposePromotionOptions {
  /** Minimum row count before a key is worth suggesting. */
  threshold?: number
  /** Keys the user has already dismissed — never proposed again. */
  dismissed?: Iterable<string>
}

/** Count rows carrying `key` with a non-nullish value. */
function countCarrying(rows: ReadonlyArray<Record<string, unknown>>, key: string): number {
  let count = 0
  for (const row of rows) {
    if (row[key] !== undefined && row[key] !== null) count++
  }
  return count
}

/**
 * Propose promoting one specific overlay key.
 *
 * Returns `null` when the key is below threshold or dismissed — "not worth
 * suggesting yet". Throws when the key is not a well-formed overlay key, which
 * is a caller bug rather than a quiet no-op: a malformed key silently returning
 * `null` would be indistinguishable from a key that simply has not accumulated
 * yet.
 */
export function proposePromotion(
  rows: ReadonlyArray<Record<string, unknown>>,
  overlayKey: string,
  from: SchemaIRI,
  to: SchemaIRI,
  options: ProposePromotionOptions = {}
): PromotionProposal | null {
  const parsed = parseExtKey(overlayKey)
  if (!parsed) {
    throw new Error(`Not a well-formed overlay key: ${JSON.stringify(overlayKey)}`)
  }
  const threshold = options.threshold ?? DEFAULT_PROMOTION_THRESHOLD
  if (options.dismissed && new Set(options.dismissed).has(overlayKey)) return null

  const count = countCarrying(rows, overlayKey)
  if (count < threshold) return null

  return {
    overlayKey,
    authority: parsed.authority,
    field: parsed.field,
    count,
    coverage: rows.length === 0 ? 0 : count / rows.length,
    lens: composeLens(from, to, promoteOverlay(parsed.authority, parsed.field, parsed.field))
  }
}

/**
 * Scan every overlay key present across `rows` and propose the ones that have
 * accumulated past the threshold, most-used first.
 *
 * Malformed `ext:`-prefixed keys are skipped rather than thrown on — unlike the
 * single-key entry point, the caller here did not name the key, so a stray one
 * in the data is not a caller bug.
 */
export function proposePromotions(
  rows: ReadonlyArray<Record<string, unknown>>,
  from: SchemaIRI,
  to: SchemaIRI,
  options: ProposePromotionOptions = {}
): PromotionProposal[] {
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (parseExtKey(key)) seen.add(key)
    }
  }

  const proposals: PromotionProposal[] = []
  for (const key of seen) {
    const proposal = proposePromotion(rows, key, from, to, options)
    if (proposal) proposals.push(proposal)
  }
  // Most-used first; stable by key so the suggestion order does not churn.
  return proposals.sort((a, b) => b.count - a.count || a.overlayKey.localeCompare(b.overlayKey))
}
