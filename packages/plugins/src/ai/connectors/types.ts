/**
 * Bring-Your-Own-Model connector contract (exploration 0174).
 *
 * No single transport reaches a model from a sandboxed HTTPS tab everywhere, so
 * the app probes a tiered set of "connectors" and degrades gracefully. Each
 * connector ultimately produces an {@link AIProvider} (see `../providers`); this
 * module only models *detection and selection* — which tiers are usable right
 * now and how capable each is — so it stays pure and unit-testable without a
 * GPU, Ollama, a key, or a browser.
 */

/** The model-access tiers, from the exploration's options A–E (+ managed, 0208). */
export type ConnectorTier =
  | 'managed' // F: XNet Cloud metered AI (no key; hub forwards to the gateway)
  | 'webllm' // A: in-tab WebGPU model, zero install, Safari-safe, offline
  | 'local-server' // B: Ollama / LM Studio over localhost
  | 'prompt-api' // C: Chrome built-in AI (Gemini Nano)
  | 'cloud-key' // D: BYO cloud API key (Anthropic / OpenAI / OpenRouter)
  | 'bridge' // E: local daemon driving a Claude Code / Codex subscription

/**
 * How reliably the tier's model can call tools. This is the gate the
 * exploration identifies: `reliable` → full agentic writes; otherwise writes
 * must downgrade to "propose a plan, human applies" (see {@link writeModeFor}).
 */
export type ToolCallingFidelity = 'reliable' | 'weak' | 'none'

/** Whether the agent may apply writes itself, or must only propose them. */
export type WriteMode = 'agentic' | 'propose-only'

/**
 * Injectable probes so detection is testable and host-agnostic. Every field has
 * a sensible default in {@link detectConnectors}; tests and non-browser hosts
 * override what they need.
 */
export interface ConnectorEnv {
  /**
   * Probe XNet Cloud managed AI: GET `${managedUrl}/ai/health` is `ok` and the
   * tenant has AI enabled. Default: a same-origin fetch (returns false off-cloud).
   */
  probeManaged?: (baseUrl: string) => Promise<boolean>
  /** Base URL the hub serves the managed `/ai` routes from. Default: `''` (same origin). */
  managedUrl?: string
  /** WebGPU present (enables in-tab models). Default: `navigator.gpu` check. */
  hasWebGpu?: () => boolean | Promise<boolean>
  /**
   * Whether the host can actually build an in-tab WebLLM engine (the heavy
   * `@mlc-ai/web-llm` import is host-supplied, see the panel). The `webllm` tier
   * is reported available only when this AND {@link hasWebGpu} are true —
   * detecting WebGPU alone would advertise a tier the host can't instantiate,
   * leaving the composer silently disabled. Default: `false` (no engine wired).
   */
  hasWebLLMEngine?: () => boolean | Promise<boolean>
  /**
   * Chrome built-in `LanguageModel` is present *and the model is ready to use*.
   * Default: probes `LanguageModel.availability()` and reports ready only for
   * `'available'` — mere API presence (`'downloadable'`) means a session can't
   * be created without a user-gesture download first (see the panel's gesture).
   */
  hasPromptApi?: () => boolean | Promise<boolean>
  /** Local model endpoints to probe, in priority order. Default: Ollama, LM Studio. */
  localServerProbes?: readonly LocalServerProbe[]
  /** Whether a cloud API key is stored locally. Default: `false` (host wires this). */
  hasCloudKey?: () => boolean | Promise<boolean>
  /** Probe a local bridge daemon. Default: GET `${bridgeUrl}/health`. */
  probeBridge?: (baseUrl: string) => Promise<boolean>
  /** Bridge daemon base URL. Default: `http://127.0.0.1:31416`. */
  bridgeUrl?: string
  /**
   * This app's own origin (e.g. `https://app.xnet.fyi`). When provided, the
   * `local-server` setup hint names the *exact* `OLLAMA_ORIGINS=<origin>` line to
   * run — never a wildcard, which would let any site drive the user's local
   * model. Default: unset (a generic hint).
   */
  appOrigin?: string
}

/** A named local model endpoint and how to detect it. */
export interface LocalServerProbe {
  label: string
  baseUrl: string
  probe: (baseUrl: string) => Promise<boolean>
}

/** The result of probing one tier. */
export interface ConnectorDetection {
  tier: ConnectorTier
  label: string
  available: boolean
  /** Extra context when available (e.g. the reachable endpoint or model). */
  detail?: string
  /** When unavailable: why, and how to enable it. */
  setupHint?: string
  /** Tool-calling fidelity → gates agentic vs propose-only writes. */
  toolCalling: ToolCallingFidelity
  /** Preference rank; lower is more capable/preferred. */
  preference: number
}

/** Map tool-calling fidelity to the safe write mode for that tier. */
export function writeModeFor(toolCalling: ToolCallingFidelity): WriteMode {
  return toolCalling === 'reliable' ? 'agentic' : 'propose-only'
}
