/**
 * Local affinity derivation (exploration 0174).
 *
 * The xNet differentiator: don't make people write a dating profile — derive an
 * honest, editable interest profile from the graph they already own (imported
 * social actors/content/interactions, tags, channels, projects). The embedding
 * step is INJECTED so this module has no hard dependency on @xnetjs/vectors and
 * the deterministic parts stay unit-testable.
 */

import { encodeVector } from './matching'

export type InterestTagRank = { id: string; name: string; weight: number }

export type AffinityInput = {
  /** Ranked interest tags (e.g. from TagSchema usage across the owned graph). */
  tags?: readonly InterestTagRank[]
  /** Titles/descriptions of saved or enriched content. */
  savedTitles?: readonly string[]
  /** Short project/brief summaries the person authored. */
  projectBriefs?: readonly string[]
}

export type AffinityDraft = {
  /** Empty headline — the user fills this; the derivation never fabricates a voice. */
  headline: string
  interests: InterestTagRank[]
  /** Synthesized text that was embedded (kept for transparency/audit). */
  interestText: string
  /** Base64 affinity vector, or '' when no embedder was provided. */
  affinityVector: string
  derivedFrom: { tags: number; saved: number; projects: number }
}

/** Rank tag occurrences into a weighted interest list (most frequent first). */
export function rankInterestTags(
  occurrences: readonly { id: string; name: string }[],
  limit = 12
): InterestTagRank[] {
  const counts = new Map<string, { name: string; count: number }>()
  for (const tag of occurrences) {
    const entry = counts.get(tag.id) ?? { name: tag.name, count: 0 }
    entry.count += 1
    counts.set(tag.id, entry)
  }
  const max = Math.max(1, ...[...counts.values()].map((entry) => entry.count))
  return [...counts.entries()]
    .map(([id, entry]) => ({ id, name: entry.name, weight: entry.count / max }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** Synthesize an honest, deterministic interest text from owned signal. */
export function synthesizeInterestText(input: AffinityInput): string {
  const lines: string[] = []
  const tags = input.tags ?? []
  if (tags.length > 0) {
    lines.push(tags.map((tag) => tag.name).join(', '))
  }
  lines.push(...(input.savedTitles ?? []))
  lines.push(...(input.projectBriefs ?? []))
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

export type Embedder = (text: string) => Promise<readonly number[]> | readonly number[]

/**
 * Build an affinity draft. `embed` is injected (e.g. a thin wrapper over
 * `@xnetjs/vectors` `SemanticSearch`); when omitted, the vector is left empty so
 * the deterministic interest extraction is still usable and testable.
 */
export async function deriveAffinity(
  input: AffinityInput,
  embed?: Embedder
): Promise<AffinityDraft> {
  const interests = input.tags ? [...input.tags] : []
  const interestText = synthesizeInterestText(input)
  const vector = embed && interestText.length > 0 ? await embed(interestText) : []

  return {
    headline: '',
    interests,
    interestText,
    affinityVector: vector.length > 0 ? encodeVector([...vector]) : '',
    derivedFrom: {
      tags: (input.tags ?? []).length,
      saved: (input.savedTitles ?? []).length,
      projects: (input.projectBriefs ?? []).length
    }
  }
}
