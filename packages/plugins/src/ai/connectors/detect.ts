/**
 * Connector detection (exploration 0174).
 *
 * Probes the model-access tiers in parallel and returns them ranked by
 * capability so the chat panel can prefer the most capable available tier and
 * fall back gracefully. Pure given its {@link ConnectorEnv}; the defaults touch
 * `navigator`/`fetch` but every probe is overridable.
 */

import type {
  ConnectorDetection,
  ConnectorEnv,
  ConnectorTier,
  LocalServerProbe,
  ToolCallingFidelity
} from './types'
import { isOllamaAvailable } from '../providers'
import { promptApiAvailability } from './prompt-api-provider'

interface ConnectorMeta {
  label: string
  toolCalling: ToolCallingFidelity
  /** Lower = more capable/preferred. Mirrors the exploration: E > D > B > A > C. */
  preference: number
}

/** Stable per-tier metadata. Keep ordering aligned with the recommendation. */
export const CONNECTOR_META: Record<ConnectorTier, ConnectorMeta> = {
  // Preferred when available: no key to paste, metered + budget-capped, switchable
  // models — the managed path the rest of this exploration (0208) wires up.
  managed: {
    label: 'xNet Cloud (managed, metered)',
    toolCalling: 'reliable',
    preference: 0
  },
  bridge: {
    label: 'Local bridge (Claude Code / Codex subscription)',
    toolCalling: 'reliable',
    preference: 1
  },
  'cloud-key': {
    label: 'Cloud API key (Anthropic / OpenAI / OpenRouter)',
    toolCalling: 'reliable',
    preference: 2
  },
  'local-server': {
    label: 'Local model (Ollama / LM Studio)',
    toolCalling: 'reliable',
    preference: 3
  },
  webllm: {
    label: 'In-browser model (WebLLM, WebGPU)',
    toolCalling: 'weak',
    preference: 4
  },
  'prompt-api': {
    label: 'Chrome built-in AI (Gemini Nano)',
    toolCalling: 'none',
    preference: 5
  }
}

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:31416'

/**
 * Setup hint for the local-server tier. When the app origin is known, name the
 * *exact* `OLLAMA_ORIGINS=<origin>` line — never a wildcard, which would let any
 * website drive the user's local model (the Ollama community's own warning).
 */
export function localServerSetupHint(appOrigin?: string): string {
  if (appOrigin) {
    return (
      `Start Ollama or LM Studio and allow this origin — for Ollama run ` +
      `\`OLLAMA_ORIGINS=${appOrigin} ollama serve\` (never \`*\`), or enable the ` +
      `LM Studio CORS toggle.`
    )
  }
  return 'Start Ollama or LM Studio and allow this origin (OLLAMA_ORIGINS=<this app’s origin>, never *; or the LM Studio CORS toggle).'
}

/** Default local-model endpoints: Ollama (`/api/tags`) and LM Studio (`/v1/models`). */
export function defaultLocalServerProbes(): LocalServerProbe[] {
  return [
    { label: 'Ollama', baseUrl: 'http://localhost:11434', probe: isOllamaAvailable },
    { label: 'LM Studio', baseUrl: 'http://localhost:1234', probe: probeOpenAiCompatible }
  ]
}

/** Probe an OpenAI-compatible server's `/v1/models`. Used for LM Studio etc. */
export async function probeOpenAiCompatible(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
    return res.ok
  } catch {
    return false
  }
}

async function defaultProbeBridge(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

/**
 * Default managed-AI probe: the hub's `aiForwarderFeature` answers `/ai/health`
 * with `{ ok: true, managed: true }` only when the control plane is configured and
 * the tenant has AI enabled. Off-cloud (self-host, no forwarder) it 404s/throws →
 * the tier reports unavailable and hides, so BYO stays the OSS path.
 */
async function defaultProbeManaged(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/ai/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean; managed?: boolean }
    return body.ok === true && body.managed === true
  } catch {
    return false
  }
}

/**
 * Detect which model connectors are usable right now, ranked by preference
 * (most capable first). Runs all probes concurrently.
 */
export async function detectConnectors(env: ConnectorEnv = {}): Promise<ConnectorDetection[]> {
  const localServerProbes = env.localServerProbes ?? defaultLocalServerProbes()
  const bridgeUrl = env.bridgeUrl ?? DEFAULT_BRIDGE_URL
  const probeBridge = env.probeBridge ?? defaultProbeBridge
  const managedUrl = env.managedUrl ?? ''
  const probeManaged = env.probeManaged ?? defaultProbeManaged

  const [webgpu, webllmEngine, promptApi, localServer, cloudKey, bridge, managed] =
    await Promise.all([
      resolveBool(env.hasWebGpu, defaultHasWebGpu),
      resolveBool(env.hasWebLLMEngine, () => false),
      resolveBool(env.hasPromptApi, defaultHasPromptApi),
      detectLocalServer(localServerProbes),
      resolveBool(env.hasCloudKey, () => false),
      probeBridge(bridgeUrl),
      probeManaged(managedUrl).catch(() => false)
    ])

  // The in-tab tier is usable only when WebGPU is present AND the host wired an
  // engine factory. WebGPU alone advertised a tier the panel couldn't build —
  // the "webllm trap" that left the composer permanently disabled with no hint.
  const webllm = webgpu && webllmEngine

  const base: Array<Pick<ConnectorDetection, 'tier' | 'available' | 'detail' | 'setupHint'>> = [
    {
      tier: 'managed',
      available: managed,
      ...(managed
        ? {}
        : { setupHint: 'Managed AI is available on xNet Cloud plans with AI enabled.' })
    },
    {
      tier: 'bridge',
      available: bridge,
      ...(bridge ? { detail: bridgeUrl } : { setupHint: `No bridge daemon at ${bridgeUrl}.` })
    },
    {
      tier: 'cloud-key',
      available: cloudKey,
      ...(cloudKey
        ? {}
        : { setupHint: 'Add an Anthropic / OpenAI / OpenRouter API key in settings.' })
    },
    {
      tier: 'local-server',
      available: localServer.available,
      ...(localServer.available
        ? { detail: localServer.detail }
        : { setupHint: localServerSetupHint(env.appOrigin) })
    },
    {
      tier: 'webllm',
      available: webllm,
      ...(webllm
        ? {}
        : {
            setupHint: webgpu
              ? 'In-browser model not enabled in this build yet.'
              : 'WebGPU unavailable; use a Chromium browser or Safari 26+.'
          })
    },
    {
      tier: 'prompt-api',
      available: promptApi,
      ...(promptApi
        ? {}
        : {
            setupHint:
              'Chrome built-in AI not detected (needs a recent Chrome with the model downloaded).'
          })
    }
  ]

  const detections: ConnectorDetection[] = base.map((entry) => ({
    ...entry,
    label: CONNECTOR_META[entry.tier].label,
    toolCalling: CONNECTOR_META[entry.tier].toolCalling,
    preference: CONNECTOR_META[entry.tier].preference
  }))

  return detections.sort((a, b) => a.preference - b.preference)
}

/** The most-preferred *available* connector, or null if none are usable. */
export function pickBestConnector(
  detections: readonly ConnectorDetection[]
): ConnectorDetection | null {
  return detections.find((d) => d.available) ?? null
}

async function detectLocalServer(
  probes: readonly LocalServerProbe[]
): Promise<{ available: boolean; detail?: string }> {
  const results = await Promise.all(
    probes.map(async (p) => ({ ...p, reachable: await p.probe(p.baseUrl) }))
  )
  const hit = results.find((r) => r.reachable)
  return hit ? { available: true, detail: `${hit.label} (${hit.baseUrl})` } : { available: false }
}

async function resolveBool(
  fn: (() => boolean | Promise<boolean>) | undefined,
  fallback: () => boolean | Promise<boolean>
): Promise<boolean> {
  try {
    return (await (fn ?? fallback)()) === true
  } catch {
    return false
  }
}

function defaultHasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/**
 * Ready only when the on-device model is fully `'available'`. Presence of the
 * `LanguageModel` global isn't enough — when the model is still `'downloadable'`
 * / `'downloading'`, `create()` can't produce a session without a user-gesture
 * download first, so reporting it "available" would disable the composer.
 */
async function defaultHasPromptApi(): Promise<boolean> {
  return (await promptApiAvailability()) === 'available'
}
