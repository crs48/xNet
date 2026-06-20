/**
 * xNet Cloud — managed-AI model catalog (exploration 0208).
 *
 * Proxies OpenRouter's live `GET /api/v1/models` into a small, UI-friendly
 * {@link ModelCard} shape (id, family, per-million prices, context, modality) and
 * caches it behind a TTL with single-flight refresh + stale-while-revalidate, so
 * the picker is data-driven (hundreds of models, real prices, no redeploy) without
 * hammering the upstream. Thin + `fetch`/`now`-injectable, so it's testable with
 * no network and no real clock.
 */

/** One model as the picker needs it. Price/context are null when the upstream omits them. */
export interface ModelCard {
  /** OpenRouter id, `provider/model`, e.g. `anthropic/claude-sonnet-4-6`. */
  id: string
  name: string
  /** The `provider` segment of the id, for grouping in the picker. */
  family: string
  /** Input price, USD per 1M tokens (`pricing.prompt × 1e6`). */
  inUsdPerM: number | null
  /** Output price, USD per 1M tokens (`pricing.completion × 1e6`). */
  outUsdPerM: number | null
  contextLength: number | null
  /** e.g. `text->text`, `text+image->text`. */
  modality: string | null
}

/** The raw OpenRouter `/models` entry (only the fields we read). */
interface OpenRouterModel {
  id?: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  architecture?: { modality?: string }
}

/** USD-per-token decimal string → USD per 1M tokens, or null when absent/garbage. */
function perMillion(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n * 1_000_000 : null
}

/** Normalize one raw model into a {@link ModelCard}, or null when it has no id. */
export function toModelCard(model: OpenRouterModel): ModelCard | null {
  if (!model.id) return null
  return {
    id: model.id,
    name: model.name ?? model.id,
    family: model.id.split('/')[0] ?? model.id,
    inUsdPerM: perMillion(model.pricing?.prompt),
    outUsdPerM: perMillion(model.pricing?.completion),
    contextLength: typeof model.context_length === 'number' ? model.context_length : null,
    modality: model.architecture?.modality ?? null
  }
}

export interface FetchModelCatalogConfig {
  /** OpenRouter API base, e.g. `https://openrouter.ai/api/v1`. */
  baseUrl?: string
  fetchImpl?: typeof fetch
}

/** Fetch + normalize the full OpenRouter catalog. Throws on a non-2xx upstream. */
export async function fetchModelCatalog(
  config: FetchModelCatalogConfig = {}
): Promise<ModelCard[]> {
  const baseUrl = (config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const fetchImpl = config.fetchImpl ?? fetch
  const res = await fetchImpl(`${baseUrl}/models`, { method: 'GET' })
  if (!res.ok) throw new Error(`openrouter /models → ${res.status}`)
  const data = (await res.json()) as { data?: OpenRouterModel[] }
  return (data.data ?? []).map(toModelCard).filter((m): m is ModelCard => m !== null)
}

export interface ModelCatalogCacheConfig extends FetchModelCatalogConfig {
  /** Cache lifetime in ms (default 10 min). */
  ttlMs?: number
  /** Clock (tests). Default `Date.now`. */
  now?: () => number
}

/** A cached catalog with single-flight refresh + stale-while-revalidate. */
export interface ModelCatalog {
  /** Cached cards; refreshes past the TTL. Returns the last good value if a refresh fails. */
  get(): Promise<ModelCard[]>
}

/**
 * Wrap {@link fetchModelCatalog} in a TTL cache. A stale value is served while a
 * background refresh runs (so chat never blocks on the catalog), and a failed
 * refresh keeps the last good value rather than throwing.
 */
export function createModelCatalog(config: ModelCatalogCacheConfig = {}): ModelCatalog {
  const ttlMs = config.ttlMs ?? 10 * 60 * 1000
  const now = config.now ?? Date.now
  let cached: ModelCard[] | null = null
  let fetchedAt = 0
  let inflight: Promise<ModelCard[]> | null = null

  const refresh = (): Promise<ModelCard[]> => {
    inflight ??= fetchModelCatalog(config)
      .then((cards) => {
        cached = cards
        fetchedAt = now()
        return cards
      })
      .catch((err) => {
        if (cached) return cached // keep the last good value on a transient failure
        throw err
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  return {
    async get() {
      const fresh = cached !== null && now() - fetchedAt < ttlMs
      if (fresh) return cached as ModelCard[]
      if (cached !== null) {
        void refresh() // stale-while-revalidate: serve stale, refresh in the background
        return cached
      }
      return refresh()
    }
  }
}
