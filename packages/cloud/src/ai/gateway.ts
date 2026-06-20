/**
 * @xnetjs/cloud/ai — OpenAI-compatible gateway client.
 *
 * Talks to a LiteLLM proxy (OpenAI-compatible) with a per-tenant virtual key. The
 * client itself is thin and testable with an injected `fetch` (or msw / an msw
 * OpenAI stub / LiteLLM's `mock_response`) — no provider keys (exploration 0176).
 */

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface ChatRequest {
  /** Per-tenant LiteLLM virtual key (carries the budget). */
  virtualKey: string
  model: string
  messages: ChatMessage[]
  /**
   * Same-tier fallback models tried in order if `model` is unavailable (context
   * overflow, moderation, rate-limit, downtime). OpenRouter takes these as its
   * `models: [primary, ...fallbacks]` array; metering still charges off whatever
   * `usage.cost` the served model returns, and `ChatResult.model` says which ran.
   * Ignored by upstreams without model-fallback support (LiteLLM). (Exploration 0208.)
   */
  fallbackModels?: string[]
  maxTokens?: number
  /** LiteLLM passthrough: return this canned text instead of calling a provider (tests/CI). */
  mockResponse?: string
}

export interface ChatResult {
  text: string
  model: string
  usage: TokenUsage
  /**
   * Ground-truth provider cost (USD) for this call, when the upstream reports it
   * (e.g. OpenRouter's `usage.cost`). When present, the metered layer charges off
   * this exact figure instead of estimating from a static price table — caching,
   * reasoning, and image tokens are already baked in. Undefined for upstreams that
   * don't report cost (raw OpenAI, dev mocks) → the table estimate is used.
   */
  providerCostUsd?: number
}

/** The gateway surface the metered layer depends on (real client or a fake). */
export interface ChatGateway {
  chat(req: ChatRequest): Promise<ChatResult>
}

export interface GatewayClientConfig {
  /** LiteLLM proxy base URL, e.g. `http://localhost:4000`. */
  baseUrl: string
  fetchImpl?: typeof fetch
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  model?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

export class GatewayClient implements ChatGateway {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(config: GatewayClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${req.virtualKey}` },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        ...(req.mockResponse !== undefined ? { mock_response: req.mockResponse } : {})
      })
    })
    if (!res.ok) {
      // LiteLLM returns 429/400 with a budget message when a virtual key is exhausted.
      throw new GatewayError(`gateway error ${res.status}: ${await safeText(res)}`, res.status)
    }
    const data = (await res.json()) as OpenAIChatResponse
    const inputTokens = data.usage?.prompt_tokens ?? 0
    const outputTokens = data.usage?.completion_tokens ?? 0
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      model: data.model ?? req.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: data.usage?.total_tokens ?? inputTokens + outputTokens
      }
    }
  }
}

const safeText = async (res: Response): Promise<string> => {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
