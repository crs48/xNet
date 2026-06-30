/**
 * In-tab WebLLM engine (exploration 0252, finishing 0174 tier A).
 *
 * Builds a real `@mlc-ai/web-llm` engine and wraps it in the dependency-free
 * `WebLLMProvider` from `@xnetjs/plugins`. The heavy library is imported lazily
 * — only when the user actually loads the in-browser model — so it never lands
 * in the main bundle (mirrors how `@xnetjs/vectors` lazy-loads its embedding
 * model). The model weights download once and are cached by the browser, so the
 * tier then runs offline. Nothing leaves the device.
 *
 * This is the engine-injection path the panel passes as `hasWebLLMEngine`,
 * which is what flips the `webllm` connector from "detectable" to "usable".
 */

import { createWebLLMProvider, type WebLLMEngineLike, type WebLLMProvider } from '@xnetjs/plugins'

// `@mlc-ai/web-llm` ships no node-safe entry and has its own heavy types; load
// it lazily and structurally, like the embedding model in @xnetjs/vectors.
let webllmModule: any = null

async function getWebLLM(): Promise<{
  CreateMLCEngine: (model: string, options: unknown) => Promise<WebLLMEngineLike>
}> {
  if (!webllmModule) webllmModule = await import('@mlc-ai/web-llm')
  return webllmModule
}

/**
 * Default in-tab model: a small (~1 GB) instruct model so the first-run
 * download stays friendly. Cached after the first load. Bump to a 3B for more
 * quality once the download cost is acceptable.
 */
export const DEFAULT_WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

/** First-run load/download progress, as `@mlc-ai/web-llm` reports it. */
export interface WebLLMProgress {
  /** Fraction in [0, 1]. */
  fraction: number
  /** Human-readable status (e.g. "Fetching param cache[12/38]"). */
  text: string
}

export interface BuildWebLLMOptions {
  /** Model id from the WebLLM prebuilt catalog. Default {@link DEFAULT_WEBLLM_MODEL}. */
  model?: string
  /** Called as the model downloads/initialises, for a progress bar. */
  onProgress?: (progress: WebLLMProgress) => void
}

/**
 * Create an in-tab WebLLM provider, downloading + initialising the model on
 * first use. Rejects if WebGPU is unavailable or the download fails (the caller
 * surfaces that as the composer's error). Must be reachable from a user gesture
 * so the multi-hundred-MB download isn't a surprise.
 */
export async function buildWebLLMProvider(
  options: BuildWebLLMOptions = {}
): Promise<WebLLMProvider> {
  const model = options.model ?? DEFAULT_WEBLLM_MODEL
  const { CreateMLCEngine } = await getWebLLM()
  const engine = await CreateMLCEngine(model, {
    initProgressCallback: (report: { progress: number; text: string }) =>
      options.onProgress?.({ fraction: report.progress, text: report.text })
  })
  return createWebLLMProvider({ engine, model })
}
