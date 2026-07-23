/**
 * Maps a detected model connector + local settings to an AIProviderConfig
 * (exploration 0174). Pure, so it is unit-tested without a browser.
 *
 * The cloud-key and local-server / bridge tiers resolve to a `createAIProvider`
 * config. The in-tab tiers (webllm, prompt-api) need an injected engine/session
 * and are constructed directly in the panel, so they return null here.
 */

import type { AIProviderConfig, ConnectorDetection, ConnectorTier } from '@xnetjs/plugins'

export type CloudProvider = 'anthropic' | 'openai' | 'openrouter'

export interface AiChatSettings {
  /** BYO cloud API key (stored locally, never sent to the hub). */
  apiKey?: string
  /** Which cloud provider the key is for. */
  cloudProvider?: CloudProvider
  /** Optional model id override. */
  model?: string
  /** Base URL override for the local-server tier. */
  localBaseUrl?: string
  /** Hub base URL for the managed tier (default `''` = same origin). */
  hubBaseUrl?: string
  /**
   * Pairing code for the local bridge daemon, sent as `Authorization: Bearer`.
   * Under Electron it's auto-supplied over IPC; in a plain browser the user
   * pastes the code `xnet bridge serve` prints.
   */
  bridgeToken?: string
}

/** localStorage keys (xnet:* convention). */
export const AI_CHAT_STORAGE_KEYS = {
  apiKey: 'xnet:ai-api-key',
  cloudProvider: 'xnet:ai-cloud-provider',
  model: 'xnet:ai-model',
  localBaseUrl: 'xnet:ai-local-base-url',
  /** The local-bridge pairing code (survives reload; per-launch tokens re-pair). */
  bridgeToken: 'xnet:ai-bridge-token',
  /** The connector tier the user last selected (survives reload). */
  tier: 'xnet:ai-tier',
  /** Opt-in: use on-device semantic (vector) entry search (exploration 0211). */
  semanticSearch: 'xnet:ai-semantic-search'
} as const

/** Connector tiers that resolve to a `createAIProvider` config (vs. in-tab). */
export const PROVIDER_CONFIG_TIERS: readonly ConnectorTier[] = [
  'managed',
  'cloud-key',
  'local-server',
  'bridge'
]

/**
 * Tiers the panel can actually instantiate a provider for: the config-backed
 * tiers plus the in-tab tiers `prompt-api` (built from an injected session) and
 * `webllm` (built from a host-supplied `@mlc-ai/web-llm` engine, see
 * `ai-webllm-engine.ts`). `webllm` is now safe to auto-select because the heavy
 * model download is gated behind an explicit "load" gesture in the panel rather
 * than firing the moment the tier is chosen.
 */
export const USABLE_TIERS: readonly ConnectorTier[] = [
  ...PROVIDER_CONFIG_TIERS,
  'prompt-api',
  'webllm'
]

/** Whether the panel can build a working provider for this tier right now. */
export function isUsableTier(tier: ConnectorTier): boolean {
  return USABLE_TIERS.includes(tier)
}

/**
 * The most-preferred *available and usable* connector, or null. Mirrors
 * `pickBestConnector` but skips tiers the panel can't instantiate (webllm),
 * relying on the same preference ordering of the input.
 */
export function pickUsableConnector(
  detections: readonly ConnectorDetection[]
): ConnectorDetection | null {
  return detections.find((d) => d.available && isUsableTier(d.tier)) ?? null
}

/**
 * Resolve an AIProviderConfig for a connector, or null when the tier needs an
 * in-tab engine (webllm / prompt-api) or required settings are missing.
 */
export function providerConfigForConnector(
  detection: ConnectorDetection,
  settings: AiChatSettings
): AIProviderConfig | null {
  switch (detection.tier) {
    case 'managed': {
      // No key and no base-URL typing: the hub is the origin and injects the
      // per-tenant credential. The model comes from the picker / plan default.
      return {
        type: 'managed',
        options: {
          baseUrl: settings.hubBaseUrl ?? '',
          ...(settings.model ? { model: settings.model } : {})
        }
      }
    }
    case 'cloud-key': {
      if (!settings.apiKey) return null
      const type = settings.cloudProvider ?? 'anthropic'
      return {
        type,
        options: { apiKey: settings.apiKey, ...(settings.model ? { model: settings.model } : {}) }
      }
    }
    case 'local-server': {
      const baseUrl = settings.localBaseUrl ?? baseUrlFromDetail(detection.detail)
      const type = /lm studio/i.test(detection.detail ?? '') ? 'lmstudio' : 'ollama'
      return {
        type,
        options: {
          ...(baseUrl ? { baseUrl } : {}),
          ...(settings.model ? { model: settings.model } : {})
        }
      }
    }
    case 'bridge': {
      // The bridge daemon exposes an OpenAI-compatible endpoint on loopback and
      // now requires the pairing code as `Authorization: Bearer` — without it the
      // daemon answers 401, so treat a missing code as "not configured yet".
      const baseUrl = baseUrlFromDetail(detection.detail)
      if (!baseUrl || !settings.bridgeToken) return null
      return {
        type: 'openai-compatible',
        options: {
          baseUrl,
          apiKey: settings.bridgeToken,
          ...(settings.model ? { model: settings.model } : {})
        }
      }
    }
    default:
      // webllm / prompt-api are constructed directly with an injected engine.
      return null
  }
}

/** Extract the `(http://host:port)` base URL embedded in a detection detail. */
export function baseUrlFromDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined
  const match = detail.match(/\((https?:\/\/[^)]+)\)/)
  if (match) return match[1]
  return /^https?:\/\//.test(detail) ? detail : undefined
}

// ─── Managed model catalog (the model picker) ───────────────────────────────────

/** One selectable managed model, as `GET /ai/models` returns it. */
export interface ManagedModel {
  id: string
  name: string
  family: string
  inUsdPerM: number | null
  outUsdPerM: number | null
  contextLength: number | null
  modality: string | null
}

export interface ManagedModelsResult {
  models: ManagedModel[]
  defaultModel: string | null
}

const asNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** Parse a `GET /ai/models` body into a typed, defensively-narrowed result. */
export function parseModelsResponse(data: unknown): ManagedModelsResult {
  if (!data || typeof data !== 'object') return { models: [], defaultModel: null }
  const record = data as Record<string, unknown>
  const raw = Array.isArray(record.models) ? record.models : []
  const models: ManagedModel[] = raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const m = entry as Record<string, unknown>
    if (typeof m.id !== 'string') return []
    return [
      {
        id: m.id,
        name: typeof m.name === 'string' ? m.name : m.id,
        family: typeof m.family === 'string' ? m.family : (m.id.split('/')[0] ?? m.id),
        inUsdPerM: asNumberOrNull(m.inUsdPerM),
        outUsdPerM: asNumberOrNull(m.outUsdPerM),
        contextLength: asNumberOrNull(m.contextLength),
        modality: typeof m.modality === 'string' ? m.modality : null
      }
    ]
  })
  return {
    models,
    defaultModel: typeof record.defaultModel === 'string' ? record.defaultModel : null
  }
}

/** Fetch the plan-gated managed model catalog; `[]` on any error (the picker hides). */
export async function fetchManagedModels(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ManagedModelsResult> {
  try {
    const res = await fetchImpl(`${baseUrl}/ai/models`, { credentials: 'include' })
    if (!res.ok) return { models: [], defaultModel: null }
    return parseModelsResponse(await res.json())
  } catch {
    return { models: [], defaultModel: null }
  }
}

/** A compact picker label: name + "$in/$out per Mtok" + context when known. */
export function formatModelOption(model: ManagedModel): string {
  const price =
    model.inUsdPerM !== null && model.outUsdPerM !== null
      ? ` · $${trimPrice(model.inUsdPerM)}/$${trimPrice(model.outUsdPerM)} per Mtok`
      : ''
  const context = model.contextLength ? ` · ${Math.round(model.contextLength / 1000)}k ctx` : ''
  return `${model.name}${price}${context}`
}

const trimPrice = (usdPerM: number): string =>
  usdPerM >= 1 ? usdPerM.toFixed(2).replace(/\.00$/, '') : usdPerM.toFixed(2)

/** Group models by family for an `<optgroup>`-style picker, families sorted. */
export function groupModelsByFamily(models: readonly ManagedModel[]): [string, ManagedModel[]][] {
  const groups = new Map<string, ManagedModel[]>()
  for (const model of models) {
    const list = groups.get(model.family) ?? []
    list.push(model)
    groups.set(model.family, list)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

// ─── Bridge status (which agent the local bridge is driving) ────────────────────

export interface BridgeAgentOption {
  id: string
  label: string
}

/** Coding agents the local bridge can drive (for the in-panel picker). */
export const KNOWN_BRIDGE_AGENTS: readonly BridgeAgentOption[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini CLI' },
  { id: 'opencode', label: 'OpenCode' }
]

export interface BridgeHealth {
  ok: boolean
  agent?: string
  version?: string
}

/** Parse a bridge daemon `/health` body (`bridgeHealth()` output). */
export function parseBridgeHealth(data: unknown): BridgeHealth {
  if (!data || typeof data !== 'object') return { ok: false }
  const record = data as Record<string, unknown>
  return {
    ok: record.ok === true,
    ...(typeof record.agent === 'string' ? { agent: record.agent } : {}),
    ...(typeof record.version === 'string' ? { version: record.version } : {})
  }
}

// ─── OpenRouter PKCE connect (exploration 0391, Phase 3) ────────────────────────
//
// The one "use my existing account" flow a provider explicitly designed for
// third-party apps: the user authorizes on openrouter.ai, we exchange the
// callback code (+ PKCE verifier) for a USER-SCOPED key that bills their own
// OpenRouter balance. No key copy-paste, no xNet billing relationship. This
// is the no-daemon fallback tier — the bridge (their Claude/Codex
// subscription) stays the daily-driver path.

/** localStorage key holding the in-flight PKCE verifier (cleared on finish). */
export const OPENROUTER_VERIFIER_KEY = 'xnet:ai-openrouter-verifier'

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

/** A fresh high-entropy PKCE code verifier (RFC 7636 §4.1). */
export function createPkceVerifier(
  getRandomValues: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)
): string {
  return base64Url(getRandomValues(new Uint8Array(32)))
}

/** S256 code challenge for a verifier (RFC 7636 §4.2). */
export async function pkceChallengeS256(
  verifier: string,
  subtle: SubtleCrypto = crypto.subtle
): Promise<string> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

/** The openrouter.ai authorization URL for a callback + challenge. */
export function openRouterAuthUrl(callbackUrl: string, challenge: string): string {
  const url = new URL('https://openrouter.ai/auth')
  url.searchParams.set('callback_url', callbackUrl)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

/** Exchange the callback `code` for a user-scoped key; null on any failure. */
export async function exchangeOpenRouterCode(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256'
      })
    })
    if (!res.ok) return null
    const data = (await res.json()) as { key?: unknown }
    return typeof data.key === 'string' && data.key ? data.key : null
  } catch {
    return null
  }
}

/** The `?code=` an OpenRouter callback landed with, if any. */
export function openRouterCallbackCode(search: string): string | null {
  const code = new URLSearchParams(search).get('code')
  return code && code.length > 0 ? code : null
}

// ─── Chat runtime event handling (extracted so it stays pure + tested) ──────────

export interface RuntimeEventLike {
  type: string
  threadId?: string
  payload?: unknown
}

/** The state change a runtime event implies, or null if it's not interesting. */
export interface ChatEventEffect {
  delta?: string
  settled?: boolean
  error?: string
}

export function reduceRuntimeEvent(event: RuntimeEventLike): ChatEventEffect | null {
  if (event.type === 'model.delta') {
    const text = (event.payload as { text?: string } | undefined)?.text
    return text ? { delta: text } : null
  }
  if (event.type === 'run.completed' || event.type === 'model.completed') {
    return { settled: true }
  }
  if (event.type === 'run.failed') {
    const message = (event.payload as { error?: string } | undefined)?.error
    return { settled: true, error: message ?? 'run failed' }
  }
  return null
}

export interface ChatEventHandlers {
  onDelta: (text: string) => void
  onSettled: () => void
  onError: (message: string) => void
}

/** Apply a runtime event to the chat handlers, filtered to the active thread. */
export function applyRuntimeEvent(
  event: RuntimeEventLike,
  activeThreadId: string | null,
  handlers: ChatEventHandlers
): void {
  if (event.threadId && event.threadId !== activeThreadId) return
  const effect = reduceRuntimeEvent(event)
  if (!effect) return
  if (effect.delta) handlers.onDelta(effect.delta)
  if (effect.settled) handlers.onSettled()
  if (effect.error) handlers.onError(effect.error)
}

/** Whether a message can be sent right now. */
export function canSendMessage(content: string, streaming: boolean, hasRuntime: boolean): boolean {
  return content.length > 0 && !streaming && hasRuntime
}

export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  // A browser CORS block and an unreachable local server both surface as an
  // opaque "Failed to fetch" / "Load failed" / "NetworkError". Turn that into
  // the actionable next step instead of a dead-end stack message.
  if (/failed to fetch|networkerror|load failed|\bcors\b/i.test(raw)) {
    return (
      'Could not reach the model. For a cloud key this is usually a CORS block; ' +
      'for a local model, allow this origin (set OLLAMA_ORIGINS or enable the LM Studio CORS toggle).'
    )
  }
  return raw
}
