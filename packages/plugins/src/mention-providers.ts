/**
 * @xnetjs/plugins — extensible mention/typeahead providers (exploration 0194
 * Phase 4).
 *
 * The editor's `[[` / `#` / `@` typeaheads are host-callback-driven and not
 * extensible by plugins. This contribution point lets a plugin add a new entity
 * type to a trigger — a GitHub plugin makes `@` resolve issues, a CRM plugin
 * makes it resolve contacts — and the host merges them with its own suggestions.
 *
 * `resolveMentionProviders` is the consumer logic the editor runs: it fans the
 * query out to every provider for a trigger in parallel, merges by priority,
 * dedups by suggestion id, and **timeout-guards** each provider so one slow or
 * throwing provider can never block (or break) the menu.
 */

/** A single typeahead suggestion offered by a provider. */
export interface MentionSuggestion {
  /** Stable id, used for dedup across providers. */
  id: string
  /** Text shown in the menu. */
  label: string
  /** Secondary text (e.g. a handle, path, or type). */
  detail?: string
  /** The reference to insert when chosen (defaults to `id`). */
  value?: string
  /** Lucide icon name. */
  icon?: string
}

/** A plugin-contributed provider for one typeahead trigger. */
export interface MentionProviderContribution {
  /** Unique provider id. */
  id: string
  /** Trigger token: `'[['` | `'#'` | `'@'`, or a plugin's own string. */
  trigger: string
  /** Lower runs first when merging (default 100). */
  priority?: number
  /** Resolve suggestions for a query under this trigger. */
  getSuggestions: (query: string) => MentionSuggestion[] | Promise<MentionSuggestion[]>
}

export interface ResolveMentionOptions {
  /** Per-provider timeout; a provider that exceeds it contributes nothing. */
  timeoutMs?: number
  /** Cap the merged result length. */
  limit?: number
}

const DEFAULT_TIMEOUT_MS = 150

function timeout(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))
}

/** Resolve one provider, swallowing errors and bounding it by `timeoutMs`. */
async function safeSuggestions(
  provider: MentionProviderContribution,
  query: string,
  timeoutMs: number
): Promise<MentionSuggestion[]> {
  try {
    const result = await Promise.race([
      Promise.resolve(provider.getSuggestions(query)),
      timeout(timeoutMs)
    ])
    return result === 'timeout' ? [] : result
  } catch {
    return []
  }
}

/**
 * Merge the suggestions from every provider registered for `trigger`, in
 * priority order, deduped by suggestion id, each provider timeout-guarded.
 */
export async function resolveMentionProviders(
  providers: readonly MentionProviderContribution[],
  trigger: string,
  query: string,
  options: ResolveMentionOptions = {}
): Promise<MentionSuggestion[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const matching = providers
    .filter((p) => p.trigger === trigger)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

  // Fan out in parallel; results stay in priority order for the merge.
  const perProvider = await Promise.all(matching.map((p) => safeSuggestions(p, query, timeoutMs)))

  const seen = new Set<string>()
  const merged: MentionSuggestion[] = []
  for (const suggestions of perProvider) {
    for (const suggestion of suggestions) {
      if (seen.has(suggestion.id)) continue
      seen.add(suggestion.id)
      merged.push(suggestion)
    }
  }
  return options.limit ? merged.slice(0, options.limit) : merged
}
