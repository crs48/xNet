/**
 * models.dev catalog consumer (exploration 0392).
 *
 * The cloud-key and local connector tiers had hand-maintained model lists —
 * prices and context windows that drift the moment a provider ships a new
 * model. models.dev (github.com/sst/models.dev, the OpenCode team's open
 * registry) is the community-maintained source of truth the whole ecosystem
 * consumes as static JSON: capabilities, context/output limits, and per-1M
 * costs for every provider and model.
 *
 * This module fetches `https://models.dev/api.json`, flattens the
 * provider→model tree into a flat {@link ModelCatalogEntry[]}, and — because a
 * model picker must never hang on a third-party outage — falls back to a small
 * **vendored snapshot** ({@link MODELS_DEV_SNAPSHOT}) when the fetch fails or
 * returns junk. The managed tier keeps its own hub-authoritative catalog
 * (negotiated pricing); this is for the tiers that talk to providers directly.
 *
 * Pure except for the injectable `fetch`, so it is unit-tested without network.
 */

/** One model from the catalog, flattened across providers. */
export interface ModelCatalogEntry {
  /** Provider-qualified id, e.g. `anthropic/claude-sonnet-5`. */
  id: string
  /** models.dev provider id, e.g. `anthropic`. */
  provider: string
  /** Bare model id within the provider, e.g. `claude-sonnet-5`. */
  model: string
  /** Human label, e.g. `Claude Sonnet 5`. */
  name: string
  /** Max context window in tokens, or null when unknown. */
  contextLength: number | null
  /** USD per 1M input tokens, or null when unknown. */
  inUsdPerM: number | null
  /** USD per 1M output tokens, or null when unknown. */
  outUsdPerM: number | null
  /** Whether the model can call tools (gates agentic writes). */
  toolCall: boolean
  /** Whether the model exposes reasoning/thinking. */
  reasoning: boolean
}

export interface ModelCatalogResult {
  models: ModelCatalogEntry[]
  /** `'network'` when fetched live, `'snapshot'` when the vendored fallback was used. */
  source: 'network' | 'snapshot'
}

/** The canonical live endpoint. */
export const MODELS_DEV_API_URL = 'https://models.dev/api.json'

/**
 * A tiny vendored snapshot for offline / outage fallback. Deliberately small —
 * enough that the picker is never empty, not a mirror of the whole registry
 * (that is what the live fetch is for). Kept current-ish by hand; the live
 * fetch is always preferred.
 */
export const MODELS_DEV_SNAPSHOT: readonly ModelCatalogEntry[] = Object.freeze([
  {
    id: 'anthropic/claude-sonnet-5',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    contextLength: 200_000,
    inUsdPerM: 3,
    outUsdPerM: 15,
    toolCall: true,
    reasoning: true
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    contextLength: 200_000,
    inUsdPerM: 1,
    outUsdPerM: 5,
    toolCall: true,
    reasoning: false
  },
  {
    id: 'openai/gpt-5',
    provider: 'openai',
    model: 'gpt-5',
    name: 'GPT-5',
    contextLength: 400_000,
    inUsdPerM: 1.25,
    outUsdPerM: 10,
    toolCall: true,
    reasoning: true
  },
  {
    id: 'google/gemini-2.5-pro',
    provider: 'google',
    model: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    contextLength: 1_000_000,
    inUsdPerM: 1.25,
    outUsdPerM: 10,
    toolCall: true,
    reasoning: true
  }
])

export interface FetchModelsDevOptions {
  /** Endpoint to fetch. Default {@link MODELS_DEV_API_URL}. */
  url?: string
  /** Injectable fetch (tests / non-browser hosts). Default: global `fetch`. */
  fetchImpl?: typeof fetch
  /** Abort the fetch after this many ms. Default 8000. */
  timeoutMs?: number
  /** Snapshot to fall back to. Default {@link MODELS_DEV_SNAPSHOT}. */
  snapshot?: readonly ModelCatalogEntry[]
}

/**
 * Fetch and flatten the models.dev catalog, falling back to the vendored
 * snapshot on any failure (network error, non-2xx, malformed body, or an empty
 * parse). Never throws — a model picker must always have something to show.
 */
export async function fetchModelsDevCatalog(
  options: FetchModelsDevOptions = {}
): Promise<ModelCatalogResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const snapshot = options.snapshot ?? MODELS_DEV_SNAPSHOT
  try {
    const response = await fetchImpl(options.url ?? MODELS_DEV_API_URL, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000)
    })
    if (!response.ok) return { models: [...snapshot], source: 'snapshot' }
    const models = parseModelsDevCatalog(await response.json())
    if (models.length === 0) return { models: [...snapshot], source: 'snapshot' }
    return { models, source: 'network' }
  } catch {
    return { models: [...snapshot], source: 'snapshot' }
  }
}

/**
 * Flatten the models.dev `api.json` shape — `{ [providerId]: { id, name,
 * models: { [modelId]: {...} } } }` — into a flat entry list. Defensive: any
 * missing/mistyped field degrades to a sensible default rather than throwing.
 */
export function parseModelsDevCatalog(data: unknown): ModelCatalogEntry[] {
  if (!data || typeof data !== 'object') return []
  const entries: ModelCatalogEntry[] = []
  for (const [providerId, providerRaw] of Object.entries(data as Record<string, unknown>)) {
    const provider = asRecord(providerRaw)
    const models = asRecord(provider.models)
    for (const [modelId, modelRaw] of Object.entries(models)) {
      const model = asRecord(modelRaw)
      const cost = asRecord(model.cost)
      const limit = asRecord(model.limit)
      entries.push({
        id: `${providerId}/${modelId}`,
        provider: providerId,
        model: modelId,
        name: typeof model.name === 'string' ? model.name : modelId,
        contextLength: numberOrNull(limit.context),
        inUsdPerM: numberOrNull(cost.input),
        outUsdPerM: numberOrNull(cost.output),
        toolCall: model.tool_call === true,
        reasoning: model.reasoning === true
      })
    }
  }
  return entries
}

/** Filter a catalog to the models a given provider serves. */
export function modelsForProvider(
  catalog: readonly ModelCatalogEntry[],
  provider: string
): ModelCatalogEntry[] {
  return catalog.filter((m) => m.provider === provider)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
