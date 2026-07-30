/**
 * Record lenses — mapping an xNet node onto a foreign lexicon record (0380/0389).
 *
 * `SchemaLens` (see `./lens.ts`) migrates between two *xNet* schema versions,
 * where both sides are ours and every field is accounted for. Mapping onto an
 * AT Protocol lexicon is a different problem wearing the same word, and the
 * difference is the whole reason this file exists:
 *
 * > `SchemaLens.backward` has the signature `(data) => data`. That is a plain
 * > function, not a lens `put`. A real lens put is **`put: A × C → C`** — it
 * > needs the *original* document alongside the new view, because that is the
 * > only way fields it does not model can survive the write.
 *
 * Between two xNet schema versions you can get away with the weaker signature:
 * we wrote both sides, so "fields we don't model" is the empty set. Against a
 * foreign lexicon it is never the empty set, and the failure is silent and
 * destructive:
 *
 * **`com.atproto.repo.putRecord` is a whole-object replace.** A naively typed
 * client reads a record, maps the fields it understands onto a node, maps them
 * back, and `putRecord`s the result — deleting every field some other app in
 * the atmosphere wrote. The extras bag below is therefore not a nicety for
 * fidelity; it is a correctness requirement for writing at all.
 *
 * ## Two modes, opposite truths
 *
 * The same machinery serves two operations that must not be confused (0380):
 *
 * - **`projection`** — an xNet-native node emits a lossy *card*. The node is
 *   the truth; the record is a derived summary (title, slug, timestamps, a
 *   canonical URL pointing at the body on the hub). Round-tripping is not
 *   expected to restore the node.
 * - **`incarnation`** — a node whose schema *is* a lexicon (a foreign post we
 *   host and edit). The record is the truth and the round trip must be exact.
 *
 * Both directions take a `prior`, because both directions are a `put` from the
 * perspective of whatever they are about to overwrite.
 *
 * @example
 * ```typescript
 * const pageToDocument: RecordLens = {
 *   lexicon: 'site.standard.document',
 *   source: 'xnet://xnet.fyi/Page@1.0.0',
 *   mode: 'projection',
 *   lossless: false,
 *   modelled: ['title', 'description', 'publishedAt'],
 *   forward: (node) => ({ title: node.title, description: node.excerpt }),
 *   backward: (record) => ({ title: record.title, excerpt: record.description })
 * }
 * ```
 */

import type { SchemaIRI } from './node'
import { extKey, parseExtKey } from './extension'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * An NSID — the AT Protocol name for a lexicon, e.g. `site.standard.document`.
 *
 * Deliberately a plain branded string rather than a template literal: NSIDs are
 * reverse-DNS with an arbitrary number of segments, and a template type that
 * tried to encode that would reject valid names.
 */
export type Nsid = string

/**
 * Which side holds the truth — see the file header. This is not a hint; the two
 * modes have different correctness bars, and `assertRoundTrip` only holds the
 * strict one to `incarnation`.
 */
export type RecordLensMode = 'projection' | 'incarnation'

/** A lexicon record: an untyped bag, because the foreign side defines it. */
export type LexiconRecord = Record<string, unknown>

/** A materialized node's properties. */
export type NodeProperties = Record<string, unknown>

/**
 * A lens between an xNet node and a foreign lexicon record.
 *
 * Both `forward` and `backward` receive the prior state of the side they are
 * about to overwrite. Implementations may ignore it — a pure projection card
 * usually does — but the runtime always supplies it, so a lens can be made
 * round-trip-safe later without changing any call site.
 */
export interface RecordLens {
  /** The foreign lexicon this lens targets. */
  lexicon: Nsid
  /** The xNet schema IRI this lens maps. */
  source: SchemaIRI
  /** Which side is the truth. */
  mode: RecordLensMode
  /**
   * Whether the mapping round-trips without loss. `projection` lenses are
   * lossy by definition; an `incarnation` lens claiming `true` is checkable
   * with {@link assertRoundTrip}.
   */
  lossless: boolean
  /**
   * Record fields this lens understands. Everything else in a record is
   * *unmodelled* and rides in the extras bag. Getting this list wrong is how
   * data is lost, so it is required rather than inferred from `forward`'s
   * output — a lens that conditionally omits a field would otherwise widen the
   * unmodelled set at runtime and silently double-write it.
   */
  modelled: readonly string[]
  /**
   * Node → record. `priorRecord` is the record currently in the repo, when
   * there is one; merge-preserving unmodelled fields from it is what makes
   * `putRecord` non-destructive. Use {@link projectRecord} rather than calling
   * this directly — it applies the extras bag for you.
   */
  forward: (node: NodeProperties, priorRecord?: LexiconRecord) => LexiconRecord
  /**
   * Record → node properties. `priorNode` is the node being updated, when
   * there is one; xNet-only properties (space, folder, sortKey…) live there and
   * must not be dropped just because the record never carried them.
   */
  backward: (record: LexiconRecord, priorNode?: NodeProperties) => NodeProperties
}

// ─── The extras bag ──────────────────────────────────────────────────────────

/**
 * Record fields a lens does not model are parked on the node under
 * `ext:<lexicon>/<field>` — the extension namespace that already ships
 * (`./extension.ts`), chosen over a single `json()` blob for one decisive
 * reason: **`ext:` keys are ordinary node properties and so get per-key LWW.**
 * A blob would be one value under whole-value LWW, and two editors touching
 * two different foreign fields would clobber each other.
 *
 * The lexicon is the authority segment, so two lexicons that both define
 * `title` never collide.
 */
export function extrasKeyFor(lexicon: Nsid, field: string): string {
  return extKey(lexicon, field)
}

/**
 * Split a record into the part a lens models and the part it does not.
 *
 * `$type` is never an extra: it is the lexicon's own discriminator, is implied
 * by the lens, and re-stashing it would resurrect a stale `$type` after a
 * lexicon migration.
 */
export function partitionRecord(
  record: LexiconRecord,
  modelled: readonly string[]
): { modelled: LexiconRecord; unmodelled: LexiconRecord } {
  const known = new Set(modelled)
  const inModel: LexiconRecord = {}
  const outOfModel: LexiconRecord = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === '$type') continue
    if (known.has(key)) inModel[key] = value
    else outOfModel[key] = value
  }
  return { modelled: inModel, unmodelled: outOfModel }
}

/**
 * Stash a record's unmodelled fields onto node properties as `ext:` keys.
 */
export function stashExtras(lexicon: Nsid, unmodelled: LexiconRecord): NodeProperties {
  const out: NodeProperties = {}
  for (const [field, value] of Object.entries(unmodelled)) {
    out[extrasKeyFor(lexicon, field)] = value
  }
  return out
}

/**
 * Recover the fields previously stashed for `lexicon` from a node.
 *
 * Only this lexicon's extras come back: a node carrying overlays from an org
 * (`ext:acme.com/leadScore`) must never leak them into a published record.
 * That is a privacy property, not a tidiness one.
 */
export function recoverExtras(lexicon: Nsid, node: NodeProperties): LexiconRecord {
  const out: LexiconRecord = {}
  for (const [key, value] of Object.entries(node)) {
    const parsed = parseExtKey(key)
    if (parsed?.authority === lexicon) out[parsed.field] = value
  }
  return out
}

// ─── Applying a lens ─────────────────────────────────────────────────────────

/**
 * Project a node into a lexicon record, ready for `putRecord`.
 *
 * Precedence, weakest to strongest:
 *
 * 1. unmodelled fields of the record already in the repo (`priorRecord`),
 * 2. unmodelled fields stashed on the node from a previous read,
 * 3. whatever the lens itself produces.
 *
 * (1) below (2) is deliberate: the node's stash is what *we* last saw and may
 * have been edited through our own UI, whereas the live record may have been
 * touched by another app since. Neither can override the lens, or a stale
 * extra would shadow a field the lens actually models.
 */
export function projectRecord(
  lens: RecordLens,
  node: NodeProperties,
  priorRecord?: LexiconRecord
): LexiconRecord {
  const carried = priorRecord ? partitionRecord(priorRecord, lens.modelled).unmodelled : {}
  const stashed = recoverExtras(lens.lexicon, node)
  const produced = lens.forward(node, priorRecord)
  return {
    $type: lens.lexicon,
    ...carried,
    ...stashed,
    ...produced
  }
}

/**
 * Ingest a lexicon record into node properties, stashing what we cannot model.
 *
 * The prior node's own properties are NOT merged in here — that is the caller's
 * job, because merge semantics differ by lane (a full replace on first import,
 * a per-property LWW change set on update). What this guarantees is that
 * nothing in the record is silently dropped.
 */
export function ingestRecord(
  lens: RecordLens,
  record: LexiconRecord,
  priorNode?: NodeProperties
): NodeProperties {
  const { unmodelled } = partitionRecord(record, lens.modelled)
  return {
    ...lens.backward(record, priorNode),
    ...stashExtras(lens.lexicon, unmodelled)
  }
}

// ─── Laws ────────────────────────────────────────────────────────────────────

/** What a round-trip check found. */
export interface RoundTripReport {
  ok: boolean
  /** Fields present in the original record but missing or changed after a round trip. */
  lost: string[]
}

/**
 * Check the law that makes writing safe: **ingest then project must not lose
 * fields**, whether or not the lens models them.
 *
 * This is the executable form of "we destroy unknown fields" (0380). Run it in
 * a test over a realistic record — including fields your lens has never heard
 * of — and a lens that would eat another app's data fails there instead of in
 * someone's repo.
 *
 * Note it checks *preservation*, not equality: a `projection` lens is free to
 * add or normalise fields (that is what makes it lossy), but it is never free
 * to drop one.
 */
export function assertRoundTrip(lens: RecordLens, record: LexiconRecord): RoundTripReport {
  const node = ingestRecord(lens, record)
  const projected = projectRecord(lens, node, record)
  const lost: string[] = []
  for (const [key, value] of Object.entries(record)) {
    if (key === '$type') continue
    if (!(key in projected)) {
      lost.push(key)
      continue
    }
    if (JSON.stringify(projected[key]) !== JSON.stringify(value)) lost.push(key)
  }
  return { ok: lost.length === 0, lost }
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Record lenses by source schema. One schema publishes to at most one lexicon:
 * two cards for one node would race each other on republish, and there is no
 * ordering between them to resolve the race.
 */
export class RecordLensRegistry {
  private bySource = new Map<SchemaIRI, RecordLens>()

  register(lens: RecordLens): void {
    const existing = this.bySource.get(lens.source)
    if (existing && existing.lexicon !== lens.lexicon) {
      throw new Error(
        `[xnet/data] ${lens.source} already projects to ${existing.lexicon}; ` +
          `refusing to also project to ${lens.lexicon}`
      )
    }
    this.bySource.set(lens.source, lens)
  }

  get(source: SchemaIRI): RecordLens | undefined {
    return this.bySource.get(source)
  }

  /** Every lexicon this registry can publish — the index role's subscription list. */
  lexicons(): Nsid[] {
    return [...new Set([...this.bySource.values()].map((l) => l.lexicon))].sort()
  }

  clear(): void {
    this.bySource.clear()
  }
}

/** Default global record-lens registry. */
export const recordLensRegistry = new RecordLensRegistry()
