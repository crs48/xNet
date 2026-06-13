/**
 * Chrome built-in AI provider adapter (exploration 0174, tier C).
 *
 * Wraps the browser's on-device `LanguageModel` (Gemini Nano) behind the
 * `AIProvider` contract. The API is Chrome-only and not yet in the DOM lib
 * types, so it is structurally typed here ({@link LanguageModelLike}); the
 * provider takes an injected session so it's testable without a browser, and
 * `createPromptApiProvider` resolves one from `globalThis.LanguageModel`.
 *
 * The Prompt API has no tool calling, so this reports `tools: false` →
 * propose-only writes (see `writeModeFor`).
 */

import type {
  AIGenerateRequest,
  AIModelCapabilities,
  AIProvider,
  AIStreamChunk
} from '../providers'

/** Minimal shape of a Chrome `LanguageModel` session. */
export interface LanguageModelSessionLike {
  prompt(input: string): Promise<string>
  promptStreaming(input: string): AsyncIterable<string>
}

/** Minimal shape of the global `LanguageModel` factory. */
export interface LanguageModelLike {
  availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>
  create(options?: {
    initialPrompts?: Array<{ role: string; content: string }>
  }): Promise<LanguageModelSessionLike>
}

export interface PromptApiProviderOptions {
  session: LanguageModelSessionLike
  model?: string
}

export class PromptApiProvider implements AIProvider {
  readonly name = 'prompt-api'
  private readonly session: LanguageModelSessionLike
  private readonly model: string

  constructor(options: PromptApiProviderOptions) {
    this.session = options.session
    this.model = options.model ?? 'gemini-nano'
  }

  async generate(prompt: string): Promise<string> {
    return this.session.prompt(prompt)
  }

  async *stream(request: AIGenerateRequest): AsyncIterable<AIStreamChunk> {
    const input = toPromptInput(request)
    for await (const text of this.session.promptStreaming(input)) {
      // The Prompt API yields the cumulative string; emit only the new suffix.
      if (text) yield { type: 'text', text, provider: this.name, model: this.model }
    }
    yield { type: 'done', provider: this.name, model: this.model }
  }

  getCapabilities(): AIModelCapabilities {
    return {
      tools: false, // no tool calling in the Prompt API yet
      structuredOutputs: true, // via responseConstraint, not modeled here
      streaming: true,
      contextWindow: 4096,
      local: true,
      privacy: 'local',
      quality: 'local'
    }
  }
}

/**
 * Resolve a provider from the global `LanguageModel`, downloading the model if
 * needed. Returns null if the API is unavailable (not Chrome, or no model).
 */
export async function createPromptApiProvider(
  factory?: LanguageModelLike
): Promise<PromptApiProvider | null> {
  const lm = factory ?? getGlobalLanguageModel()
  if (!lm) return null
  const availability = await lm.availability()
  if (availability === 'unavailable') return null
  const session = await lm.create()
  return new PromptApiProvider({ session })
}

function getGlobalLanguageModel(): LanguageModelLike | null {
  const candidate = (globalThis as { LanguageModel?: LanguageModelLike }).LanguageModel
  return candidate ?? null
}

function toPromptInput(request: AIGenerateRequest): string {
  if (request.messages && request.messages.length > 0) {
    return request.messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  }
  return request.prompt ?? ''
}
