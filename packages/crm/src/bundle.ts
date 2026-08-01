/**
 * Bundle derivation (exploration 0422) — read a relationship's *label* from the
 * activities two people actually share, instead of storing the label and losing
 * the activities.
 *
 * Words like "spouse", "friend" and "coworker" are shorthand for a bundle of
 * typical activities. `Relationship.kind` stores that shorthand, which makes it
 * a rollup over data the schema never captured — and the repo's rule is to
 * compute rollups at read. `Practice` rows capture the activities; this module
 * is the read.
 *
 * What it deliberately does NOT return is a score for the relationship. The
 * useful output is a **set difference**: the activities common to a kind of
 * relationship that a given pair does not share. That is a menu of things you
 * could try, not a grade — see the `scored intimacy` rule in
 * `scripts/check-humane-patterns.mjs` and Charter §6.
 */

export interface BundleReading {
  /** The bundle this reading is for ("partner", "coworker", …). */
  label: string
  /**
   * Share of the bundle's conventional activities that are practised, 0–1.
   *
   * This grades the *match between a pair and a label* — how well the word
   * "coworker" describes them — and never the relationship itself. It exists so
   * readings can be ordered; it is not a health score and must not be surfaced
   * as one.
   */
  coverage: number
  /** Conventional activities of this bundle that the pair does practise. */
  matched: string[]
  /**
   * Conventional activities of this bundle that the pair does not practise.
   * The point of the whole module: things people often do in this kind of
   * relationship that you don't — offered as possibilities, never as a deficit.
   */
  missing: string[]
}

/**
 * Derive one reading per bundle from the primitives a pair practises, ordered
 * best match first.
 *
 * Every bundle gets a reading, including those with zero overlap — an empty
 * practice set yields every bundle at coverage 0 with a full `missing` list,
 * which is a valid reading of a relationship we know nothing about rather than
 * an error. Primitives the caller passes that belong to no bundle are simply
 * not conventional anywhere; they affect no reading, which is exactly right for
 * a user-authored term.
 *
 * @param practised primitive ids/labels this pair shares (duplicates ignored)
 * @param bundles conventional activities per bundle name
 */
export function deriveBundle(
  practised: readonly string[],
  bundles: ReadonlyMap<string, readonly string[]>
): BundleReading[] {
  const have = new Set(practised)

  return [...bundles.entries()]
    .map(([label, expected]) => {
      const unique = [...new Set(expected)]
      const matched = unique.filter((p) => have.has(p))
      return {
        label,
        // An empty bundle expects nothing, so nothing about a pair can match
        // it. Coverage 0 (not 1) keeps a vacuous bundle from ranking first.
        coverage: unique.length === 0 ? 0 : matched.length / unique.length,
        matched,
        missing: unique.filter((p) => !have.has(p))
      }
    })
    .sort((a, b) => b.coverage - a.coverage || a.label.localeCompare(b.label))
}

/**
 * Build the bundle map from `RelationshipPrimitive` rows, whose
 * `conventionalBundles` is a comma-separated list of bundle names.
 *
 * Kept here rather than in the schema package so `@xnetjs/crm` stays the one
 * place that knows how the vocabulary is read.
 */
export function bundlesFromPrimitives(
  primitives: readonly { id: string; conventionalBundles?: string | null }[]
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const primitive of primitives) {
    for (const raw of (primitive.conventionalBundles ?? '').split(',')) {
      const bundle = raw.trim()
      if (bundle.length === 0) continue
      const list = out.get(bundle) ?? []
      if (!list.includes(primitive.id)) list.push(primitive.id)
      out.set(bundle, list)
    }
  }
  return out
}
