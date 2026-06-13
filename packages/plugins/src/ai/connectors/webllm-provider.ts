/**
 * WebLLM provider adapter (exploration 0174, tier A).
 *
 * Wraps an in-tab WebGPU model (`@mlc-ai/web-llm`) behind the `AIProvider`
 * contract. To keep `@xnetjs/plugins` dependency-free and node-safe, the heavy
 * library is **not** a dependency here: the provider runs against a structural
 * {@link WebLLMEngineLike} interface, and `createWebLLMProvider` takes an
 * already-created engine. The web app supplies a real engine via a lazy
 * `import('@mlc-ai/web-llm')` + `CreateMLCEngine(...)` (see the "Connect a
 * model" guide); tests inject a fake.
 *
 * WebLLM exposes an OpenAI-compatible chat-completions surface. In-tab tool
 * calling is unreliable, so this reports `tools: false` — the chat panel routes
 * its writes through propose-only mode (see `writeModeFor`).
 */

import type {
  AIGenerateRequest,
  AIModelCapabilities,
  AIProvider,
  AIStreamChunk
} from '../providers'

/** Minimal shape of an `@mlc-ai/web-llm` MLCEngine, structurally typed. */
export interface WebLLMEngineLike {
  chat: {
    completions: WebLLMCompletions
  }
}

interface WebLLMCompletions {
  create(request: WebLLMRequest & { stream?: false }): Promise<WebLLMResponse>
  create(request: WebLLMRequest & { stream: true }): Promise<AsyncIterable<WebLLMChunk>>
}

interface WebLLMRequest {
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

interface WebLLMResponse {
  choices: Array<{ message: { content: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

interface WebLLMChunk {
  choices: Array<{ delta: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export interface WebLLMProviderOptions {
  engine: WebLLMEngineLike
  /** Model id loaded into the engine (for reporting). */
  model: string
  /** Context window of the loaded model, for capability reporting. */
  contextWindow?: number
}

export class WebLLMProvider implements AIProvider {
  readonly name = 'webllm'
  private readonly engine: WebLLMEngineLike
  private readonly model: string
  private readonly contextWindow: number

  constructor(options: WebLLMProviderOptions) {
    this.engine = options.engine
    this.model = options.model
    this.contextWindow = options.contextWindow ?? 4096
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }]
    })
    return response.choices[0]?.message.content ?? ''
  }

  async *stream(request: AIGenerateRequest): AsyncIterable<AIStreamChunk> {
    const messages = toWebLLMMessages(request)
    const iterable = await this.engine.chat.completions.create({
      messages,
      stream: true,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {})
    })
    let usage: WebLLMChunk['usage']
    for await (const chunk of iterable) {
      const text = chunk.choices[0]?.delta?.content
      if (text) yield { type: 'text', text, provider: this.name, model: this.model }
      if (chunk.usage) usage = chunk.usage
    }
    if (usage) {
      yield {
        type: 'usage',
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens
        },
        provider: this.name,
        model: this.model
      }
    }
    yield { type: 'done', provider: this.name, model: this.model }
  }

  getCapabilities(): AIModelCapabilities {
    return {
      tools: false, // in-tab tool calling is unreliable → propose-only writes
      structuredOutputs: true,
      streaming: true,
      contextWindow: this.contextWindow,
      local: true,
      privacy: 'local',
      quality: 'local'
    }
  }
}

export function createWebLLMProvider(options: WebLLMProviderOptions): WebLLMProvider {
  return new WebLLMProvider(options)
}

function toWebLLMMessages(request: AIGenerateRequest): Array<{ role: string; content: string }> {
  if (request.messages && request.messages.length > 0) {
    return request.messages.map((m) => ({ role: m.role, content: m.content }))
  }
  return [{ role: 'user', content: request.prompt ?? '' }]
}
