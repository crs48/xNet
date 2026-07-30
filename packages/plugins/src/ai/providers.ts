/**
 * AI Provider Abstraction
 *
 * Defines a common interface for AI providers and includes
 * implementations for Anthropic, OpenAI-compatible endpoints, OpenAI,
 * and local (Ollama).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type AIMessage = {
  role: AIMessageRole
  content: string
  name?: string
  toolCallId?: string
}

export type AIToolSpec = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type AIPrivacyLevel = 'local' | 'cloud' | 'proxy'

export type AIModelQuality = 'local' | 'balanced' | 'strong'

export type AICostModel = {
  inputPerMillion: number
  outputPerMillion: number
  currency: 'USD'
}

export type AIModelCapabilities = {
  tools: boolean
  structuredOutputs: boolean
  streaming: boolean
  contextWindow: number
  local: boolean
  privacy: AIPrivacyLevel
  quality: AIModelQuality
  cost?: AICostModel
}

export type AIRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type AIComplexityLevel = 'low' | 'medium' | 'high'

export type AIGenerateRequest = {
  prompt?: string
  messages?: AIMessage[]
  tools?: AIToolSpec[]
  responseSchema?: Record<string, unknown>
  stream?: boolean
  risk?: AIRiskLevel
  complexity?: AIComplexityLevel
  maxTokens?: number
  temperature?: number
  preferredProvider?: string
  metadata?: Record<string, unknown>
}

export type AIToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type AIUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
}

export type AIGenerateResponse = {
  text: string
  provider: string
  model: string
  toolCalls?: AIToolCall[]
  usage?: AIUsage
}

export type AIStreamChunk =
  | {
      type: 'text'
      text: string
      provider: string
      model: string
    }
  | {
      type: 'tool_call'
      toolCall: AIToolCall
      provider: string
      model: string
    }
  | {
      type: 'usage'
      usage: AIUsage
      provider: string
      model: string
    }
  | {
      type: 'done'
      provider: string
      model: string
    }

export type AIProviderUsage = {
  requests: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

/**
 * Common interface for AI text generation providers.
 */
export interface AIProvider {
  /** Provider name for display/logging */
  readonly name: string

  /**
   * Generate text from a prompt.
   *
   * @param prompt - The input prompt
   * @returns Generated text response
   * @throws Error if generation fails
   */
  generate(prompt: string): Promise<string>

  /**
   * Generate a response with optional tool and structured-output metadata.
   */
  generateWithTools?(request: AIGenerateRequest): Promise<AIGenerateResponse>

  /**
   * Stream model output and tool events.
   */
  stream?(request: AIGenerateRequest): AsyncIterable<AIStreamChunk>

  /**
   * Describe model/provider capabilities for routing.
   */
  getCapabilities?(): AIModelCapabilities
}

/**
 * Options for configuring AI providers.
 */
export interface AIProviderOptions {
  /** API key (for cloud providers) */
  apiKey?: string
  /** Base URL (for self-hosted or proxy) */
  baseUrl?: string
  /** Model to use */
  model?: string
  /** Maximum tokens to generate */
  maxTokens?: number
  /** Temperature (0-1, higher = more creative) */
  temperature?: number
  /** Display name for OpenAI-compatible providers */
  providerName?: string
  /** Additional HTTP headers for compatible proxies */
  defaultHeaders?: Record<string, string>
  /** Whether an API key is required */
  apiKeyRequired?: boolean
  /** Capability overrides for routing */
  capabilities?: Partial<AIModelCapabilities>
  /**
   * Send the Anthropic browser-CORS header
   * (`anthropic-dangerous-direct-browser-access`) so a bring-your-own-key call
   * succeeds from browser JavaScript. Only `AnthropicProvider` reads this.
   * Defaults to `true` when a DOM is present (`typeof window !== 'undefined'`).
   */
  allowBrowser?: boolean
}

export type OpenAICompatibleProviderOptions = AIProviderOptions

/**
 * AI provider type identifier.
 */
export type AIProviderType =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'openai-compatible'
  | 'openrouter'
  | 'ollama-openai'
  | 'lmstudio'
  | 'vllm'
  | 'litellm'
  | 'managed'
  | 'custom'

/**
 * Configuration for selecting an AI provider.
 */
export interface AIProviderConfig {
  type: AIProviderType
  options: AIProviderOptions
}

export type AIProviderRouterOptions = {
  preferLocalRiskLevels?: AIRiskLevel[]
  strongModelRiskLevels?: AIRiskLevel[]
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Error thrown when AI generation fails.
 */
export class AIGenerationError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'AIGenerationError'
  }
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const DEFAULT_CAPABILITIES: AIModelCapabilities = {
  tools: false,
  structuredOutputs: false,
  streaming: false,
  contextWindow: 8192,
  local: false,
  privacy: 'cloud',
  quality: 'balanced'
}

const createCapabilities = (overrides: Partial<AIModelCapabilities> = {}): AIModelCapabilities => ({
  ...DEFAULT_CAPABILITIES,
  ...overrides
})

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '')

/**
 * App-attribution headers OpenRouter reads to credit traffic to xNet on its
 * public rankings/analytics (exploration 0392). `HTTP-Referer` is the app
 * identity; `X-Title` its display name. Sent only to OpenRouter.
 */
export const OPENROUTER_ATTRIBUTION_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'HTTP-Referer': 'https://xnet.fyi',
  'X-Title': 'xNet'
})

/** True when the base URL targets OpenRouter (attribution headers apply). */
export function isOpenRouterBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith('openrouter.ai')
  } catch {
    return baseUrl.includes('openrouter.ai')
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseToolArguments = (value: string | undefined): Record<string, unknown> => {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : { value: parsed }
  } catch {
    return { raw: value }
  }
}

const requestToPrompt = (request: AIGenerateRequest): string => {
  if (request.prompt) return request.prompt
  return request.messages?.map((message) => `${message.role}: ${message.content}`).join('\n') ?? ''
}

const requestToMessages = (request: AIGenerateRequest): Record<string, unknown>[] => {
  const messages = request.messages?.length
    ? request.messages
    : [{ role: 'user' as const, content: request.prompt ?? '' }]

  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.name ? { name: message.name } : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {})
  }))
}

const normalizeToolSpec = (tool: AIToolSpec): Record<string, unknown> => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.inputSchema ?? {
      type: 'object',
      properties: {},
      additionalProperties: true
    }
  }
})

const estimateCostUsd = (
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  capabilities: AIModelCapabilities
): number | undefined => {
  if (!capabilities.cost) return undefined

  const inputCost = ((inputTokens ?? 0) * capabilities.cost.inputPerMillion) / 1_000_000
  const outputCost = ((outputTokens ?? 0) * capabilities.cost.outputPerMillion) / 1_000_000
  return inputCost + outputCost
}

const normalizeUsage = (
  usage:
    | {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    | undefined,
  capabilities: AIModelCapabilities
): AIUsage | undefined => {
  if (!usage) return undefined

  const inputTokens = usage.prompt_tokens
  const outputTokens = usage.completion_tokens
  const totalTokens = usage.total_tokens ?? (inputTokens ?? 0) + (outputTokens ?? 0)
  const estimatedCostUsd = estimateCostUsd(inputTokens, outputTokens, capabilities)

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {})
  }
}

const emptyProviderUsage = (): AIProviderUsage => ({
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0
})

// ─── Anthropic Provider ──────────────────────────────────────────────────────

/**
 * AI provider for Anthropic's Claude models.
 *
 * @example
 * ```typescript
 * const provider = new AnthropicProvider({ apiKey: 'sk-...' })
 * const response = await provider.generate('Hello!')
 * ```
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'Anthropic'
  private apiKey: string
  private baseUrl: string
  private model: string
  private maxTokens: number
  private temperature: number
  private allowBrowser: boolean

  constructor(options: AIProviderOptions) {
    if (!options.apiKey) {
      throw new Error('Anthropic API key is required')
    }
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com'
    this.model = options.model ?? 'claude-sonnet-4-20250514'
    this.maxTokens = options.maxTokens ?? 2048
    this.temperature = options.temperature ?? 0.3
    this.allowBrowser = options.allowBrowser ?? typeof window !== 'undefined'
  }

  getCapabilities(): AIModelCapabilities {
    return createCapabilities({
      contextWindow: 200000,
      local: false,
      privacy: 'cloud',
      quality: 'strong',
      cost: {
        inputPerMillion: 3,
        outputPerMillion: 15,
        currency: 'USD'
      }
    })
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          // Anthropic blocks browser requests unless this header opts in to
          // direct (CORS) access. Required for the BYO-key web chat path.
          ...(this.allowBrowser ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {})
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages: [{ role: 'user', content: prompt }]
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new AIGenerationError(`Anthropic API error: ${response.status} ${error}`, this.name)
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>
      }

      const textContent = data.content.find((c) => c.type === 'text')
      if (!textContent) {
        throw new AIGenerationError('No text content in response', this.name)
      }

      return textContent.text
    } catch (err) {
      if (err instanceof AIGenerationError) throw err
      throw new AIGenerationError(
        `Anthropic generation failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err
      )
    }
  }
}

// ─── OpenAI-Compatible Provider ──────────────────────────────────────────────

type OpenAICompatibleToolCall = {
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

type OpenAICompatibleMessage = {
  content?: string | null
  tool_calls?: OpenAICompatibleToolCall[]
}

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: OpenAICompatibleMessage
    delta?: OpenAICompatibleMessage
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Tool-capable adapter for OpenAI-compatible chat completion endpoints.
 *
 * Works with OpenAI, OpenRouter, Ollama's `/v1` compatibility API,
 * LM Studio, vLLM, and LiteLLM.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string
  private apiKey?: string
  private baseUrl: string
  private model: string
  private maxTokens: number
  private temperature: number
  private defaultHeaders: Record<string, string>
  private capabilities: AIModelCapabilities

  constructor(options: OpenAICompatibleProviderOptions = {}) {
    if (options.apiKeyRequired && !options.apiKey) {
      throw new Error(`${options.providerName ?? 'OpenAI-compatible'} API key is required`)
    }

    this.name = options.providerName ?? 'OpenAI Compatible'
    this.apiKey = options.apiKey
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? 'https://api.openai.com')
    this.model = options.model ?? 'gpt-4o'
    this.maxTokens = options.maxTokens ?? 2048
    this.temperature = options.temperature ?? 0.3
    this.defaultHeaders = options.defaultHeaders ?? {}
    this.capabilities = createCapabilities({
      tools: true,
      structuredOutputs: true,
      streaming: true,
      contextWindow: 128000,
      local: false,
      privacy: 'cloud',
      quality: 'strong',
      cost: {
        inputPerMillion: 5,
        outputPerMillion: 15,
        currency: 'USD'
      },
      ...options.capabilities
    })
  }

  getCapabilities(): AIModelCapabilities {
    return this.capabilities
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.generateWithTools({ prompt })
    return response.text
  }

  async generateWithTools(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.createHeaders(),
        body: JSON.stringify(this.createPayload(request, false))
      })

      if (!response.ok) {
        const error = await response.text()
        throw new AIGenerationError(
          `${this.name} API error: ${response.status} ${error}`,
          this.name
        )
      }

      const data = (await response.json()) as OpenAICompatibleResponse
      const choice = data.choices?.[0]
      const message = choice?.message
      const text = typeof message?.content === 'string' ? message.content : ''
      const toolCalls = this.parseToolCalls(message?.tool_calls)

      if (!text && toolCalls.length === 0) {
        throw new AIGenerationError('No content in response', this.name)
      }

      return {
        text,
        provider: this.name,
        model: this.model,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        usage: normalizeUsage(data.usage, this.capabilities)
      }
    } catch (err) {
      if (err instanceof AIGenerationError) throw err
      throw new AIGenerationError(
        `${this.name} generation failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err
      )
    }
  }

  async *stream(request: AIGenerateRequest): AsyncIterable<AIStreamChunk> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify(this.createPayload(request, true))
    })

    if (!response.ok) {
      const error = await response.text()
      throw new AIGenerationError(`${this.name} API error: ${response.status} ${error}`, this.name)
    }

    if (!response.body) {
      yield { type: 'done', provider: this.name, model: this.model }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const chunk = line.trim()
          if (!chunk.startsWith('data:')) continue

          const payload = chunk.slice('data:'.length).trim()
          if (payload === '[DONE]') {
            yield { type: 'done', provider: this.name, model: this.model }
            return
          }

          const parsed = JSON.parse(payload) as OpenAICompatibleResponse
          const delta = parsed.choices?.[0]?.delta
          const text = typeof delta?.content === 'string' ? delta.content : ''
          if (text) {
            yield {
              type: 'text',
              text,
              provider: this.name,
              model: this.model
            }
          }

          for (const toolCall of this.parseToolCalls(delta?.tool_calls)) {
            yield {
              type: 'tool_call',
              toolCall,
              provider: this.name,
              model: this.model
            }
          }

          const usage = normalizeUsage(parsed.usage, this.capabilities)
          if (usage) {
            yield {
              type: 'usage',
              usage,
              provider: this.name,
              model: this.model
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { type: 'done', provider: this.name, model: this.model }
  }

  private createHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      // OpenRouter reads these for app attribution → public rankings/analytics
      // (exploration 0392). Only sent to OpenRouter; user headers still win.
      ...(isOpenRouterBaseUrl(this.baseUrl) ? OPENROUTER_ATTRIBUTION_HEADERS : {}),
      ...this.defaultHeaders,
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
    }
  }

  private createPayload(request: AIGenerateRequest, stream: boolean): Record<string, unknown> {
    return {
      model: this.model,
      max_tokens: request.maxTokens ?? this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      messages: requestToMessages(request),
      stream,
      ...(request.tools?.length
        ? {
            tools: request.tools.map(normalizeToolSpec),
            tool_choice: 'auto'
          }
        : {}),
      ...(request.responseSchema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'xnet_response',
                strict: true,
                schema: request.responseSchema
              }
            }
          }
        : {})
    }
  }

  private parseToolCalls(toolCalls: OpenAICompatibleToolCall[] | undefined): AIToolCall[] {
    return (
      toolCalls
        ?.filter((toolCall) => toolCall.type === undefined || toolCall.type === 'function')
        .map((toolCall, index) => ({
          id: toolCall.id ?? `tool-${index}`,
          name: toolCall.function?.name ?? 'unknown',
          arguments: parseToolArguments(toolCall.function?.arguments)
        })) ?? []
    )
  }
}

// ─── OpenAI Provider ─────────────────────────────────────────────────────────

/**
 * AI provider for OpenAI's GPT models.
 *
 * @example
 * ```typescript
 * const provider = new OpenAIProvider({ apiKey: 'sk-...' })
 * const response = await provider.generate('Hello!')
 * ```
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(options: AIProviderOptions) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required')
    }

    super({
      ...options,
      providerName: 'OpenAI',
      apiKeyRequired: true,
      baseUrl: options.baseUrl ?? 'https://api.openai.com',
      model: options.model ?? 'gpt-4o'
    })
  }
}

// ─── Ollama Provider (Local) ─────────────────────────────────────────────────

/**
 * AI provider for local Ollama instance.
 *
 * @example
 * ```typescript
 * const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434' })
 * const response = await provider.generate('Hello!')
 * ```
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'Ollama'
  private baseUrl: string
  private model: string
  private temperature: number

  constructor(options: AIProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434'
    this.model = options.model ?? 'codellama'
    this.temperature = options.temperature ?? 0.3
  }

  getCapabilities(): AIModelCapabilities {
    return createCapabilities({
      contextWindow: 8192,
      local: true,
      privacy: 'local',
      quality: 'local'
    })
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: this.temperature
          }
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new AIGenerationError(`Ollama API error: ${response.status} ${error}`, this.name)
      }

      const data = (await response.json()) as { response: string }

      if (!data.response) {
        throw new AIGenerationError('No response content', this.name)
      }

      return data.response
    } catch (err) {
      if (err instanceof AIGenerationError) throw err
      throw new AIGenerationError(
        `Ollama generation failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err
      )
    }
  }
}

// ─── Provider Router ─────────────────────────────────────────────────────────

const DEFAULT_ROUTER_OPTIONS: Required<AIProviderRouterOptions> = {
  preferLocalRiskLevels: ['low'],
  strongModelRiskLevels: ['high', 'critical']
}

export class AIProviderRouter implements AIProvider {
  readonly name = 'AIProviderRouter'
  private providers: AIProvider[]
  private options: Required<AIProviderRouterOptions>
  private usageByProvider = new Map<string, AIProviderUsage>()

  constructor(providers: AIProvider[], options: AIProviderRouterOptions = {}) {
    if (providers.length === 0) {
      throw new Error('AIProviderRouter requires at least one provider')
    }

    this.providers = providers
    this.options = {
      preferLocalRiskLevels:
        options.preferLocalRiskLevels ?? DEFAULT_ROUTER_OPTIONS.preferLocalRiskLevels,
      strongModelRiskLevels:
        options.strongModelRiskLevels ?? DEFAULT_ROUTER_OPTIONS.strongModelRiskLevels
    }
  }

  getCapabilities(): AIModelCapabilities {
    const capabilities = this.providers.map((provider) => this.getProviderCapabilities(provider))

    return createCapabilities({
      tools: capabilities.some((capability) => capability.tools),
      structuredOutputs: capabilities.some((capability) => capability.structuredOutputs),
      streaming: capabilities.some((capability) => capability.streaming),
      contextWindow: Math.max(...capabilities.map((capability) => capability.contextWindow)),
      local: capabilities.some((capability) => capability.local),
      privacy: capabilities.every((capability) => capability.privacy === 'local')
        ? 'local'
        : 'proxy',
      quality: capabilities.some((capability) => capability.quality === 'strong')
        ? 'strong'
        : 'balanced'
    })
  }

  getUsage(): Record<string, AIProviderUsage> {
    return Object.fromEntries(this.usageByProvider.entries())
  }

  selectProvider(request: AIGenerateRequest): AIProvider {
    const capableProviders = this.providers.filter((provider) => this.canHandle(provider, request))
    if (capableProviders.length === 0) {
      throw new AIGenerationError('No configured AI provider can handle the request', this.name)
    }

    if (request.preferredProvider) {
      const preferred = capableProviders.find(
        (provider) => provider.name === request.preferredProvider
      )
      if (preferred) return preferred
    }

    if (this.shouldPreferLocal(request)) {
      const localProvider = capableProviders.find(
        (provider) => this.getProviderCapabilities(provider).local
      )
      if (localProvider) return localProvider
    }

    if (this.shouldPreferStrong(request)) {
      const strongProvider = capableProviders.find(
        (provider) => this.getProviderCapabilities(provider).quality === 'strong'
      )
      if (strongProvider) return strongProvider
    }

    return capableProviders[0]
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.generateWithTools({ prompt })
    return response.text
  }

  async generateWithTools(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const provider = this.selectProvider(request)

    const response = provider.generateWithTools
      ? await provider.generateWithTools(request)
      : {
          text: await provider.generate(requestToPrompt(request)),
          provider: provider.name,
          model: 'unknown'
        }

    this.recordUsage(provider.name, response.usage)

    return {
      ...response,
      provider: response.provider || provider.name
    }
  }

  async *stream(request: AIGenerateRequest): AsyncIterable<AIStreamChunk> {
    const provider = this.selectProvider({ ...request, stream: true })
    if (!provider.stream) {
      throw new AIGenerationError(`${provider.name} does not support streaming`, provider.name)
    }

    for await (const chunk of provider.stream(request)) {
      if (chunk.type === 'usage') {
        this.recordUsage(provider.name, chunk.usage)
      }
      yield chunk
    }
  }

  private canHandle(provider: AIProvider, request: AIGenerateRequest): boolean {
    const capabilities = this.getProviderCapabilities(provider)
    const needsTools = Boolean(request.tools?.length)
    const needsStructuredOutput = Boolean(request.responseSchema)
    const needsStreaming = Boolean(request.stream)

    if (needsTools && !capabilities.tools) return false
    if (needsStructuredOutput && !capabilities.structuredOutputs) return false
    if (needsStreaming && !capabilities.streaming) return false
    return true
  }

  private shouldPreferLocal(request: AIGenerateRequest): boolean {
    const risk = request.risk ?? 'medium'
    return request.complexity === 'low' || this.options.preferLocalRiskLevels.includes(risk)
  }

  private shouldPreferStrong(request: AIGenerateRequest): boolean {
    const risk = request.risk ?? 'medium'
    return request.complexity === 'high' || this.options.strongModelRiskLevels.includes(risk)
  }

  private getProviderCapabilities(provider: AIProvider): AIModelCapabilities {
    return provider.getCapabilities?.() ?? createCapabilities()
  }

  private recordUsage(providerName: string, usage: AIUsage | undefined): void {
    const current = this.usageByProvider.get(providerName) ?? emptyProviderUsage()
    current.requests += 1
    current.inputTokens += usage?.inputTokens ?? 0
    current.outputTokens += usage?.outputTokens ?? 0
    current.totalTokens += usage?.totalTokens ?? 0
    current.estimatedCostUsd += usage?.estimatedCostUsd ?? 0
    this.usageByProvider.set(providerName, current)
  }
}

// ─── Provider Factory ────────────────────────────────────────────────────────

type OpenAICompatiblePreset = {
  providerName: string
  baseUrl: string
  model: string
  apiKeyRequired: boolean
  capabilities: Partial<AIModelCapabilities>
}

const OPENAI_COMPATIBLE_PRESETS: Record<
  Exclude<
    AIProviderType,
    'anthropic' | 'openai' | 'ollama' | 'openai-compatible' | 'managed' | 'custom'
  >,
  OpenAICompatiblePreset
> = {
  openrouter: {
    providerName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    model: 'openai/gpt-4o-mini',
    apiKeyRequired: true,
    capabilities: {
      local: false,
      privacy: 'proxy',
      quality: 'strong',
      contextWindow: 128000
    }
  },
  'ollama-openai': {
    providerName: 'Ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1',
    apiKeyRequired: false,
    capabilities: {
      local: true,
      privacy: 'local',
      quality: 'local',
      cost: undefined
    }
  },
  lmstudio: {
    providerName: 'LM Studio',
    baseUrl: 'http://localhost:1234',
    model: 'local-model',
    apiKeyRequired: false,
    capabilities: {
      local: true,
      privacy: 'local',
      quality: 'local',
      cost: undefined
    }
  },
  vllm: {
    providerName: 'vLLM',
    baseUrl: 'http://localhost:8000',
    model: 'local-model',
    apiKeyRequired: false,
    capabilities: {
      local: true,
      privacy: 'local',
      quality: 'balanced',
      cost: undefined
    }
  },
  litellm: {
    providerName: 'LiteLLM',
    baseUrl: 'http://localhost:4000',
    model: 'gpt-4o-mini',
    apiKeyRequired: false,
    capabilities: {
      local: false,
      privacy: 'proxy',
      quality: 'balanced'
    }
  }
}

const createOpenAICompatiblePresetProvider = (
  type: keyof typeof OPENAI_COMPATIBLE_PRESETS,
  options: AIProviderOptions
): OpenAICompatibleProvider => {
  const preset = OPENAI_COMPATIBLE_PRESETS[type]

  return new OpenAICompatibleProvider({
    ...options,
    providerName: options.providerName ?? preset.providerName,
    baseUrl: options.baseUrl ?? preset.baseUrl,
    model: options.model ?? preset.model,
    apiKeyRequired: options.apiKeyRequired ?? preset.apiKeyRequired,
    capabilities: {
      ...preset.capabilities,
      ...options.capabilities
    }
  })
}

// ─── Managed (xNet Cloud metered AI) ─────────────────────────────────────────

/** The live budget snapshot a managed call reports back (drives the panel gauge). */
export interface ManagedBudgetSnapshot {
  /** Marked-up spend accrued this billing period, in USD. */
  spendThisPeriodUsd: number
  /** Free included allotment for the period, in USD. */
  includedUsd: number
  /** Hard monthly cap, in USD — requests stop here. */
  budgetUsd: number
  /** Coarse state driving the gauge colour. */
  budgetState: 'included' | 'overage' | 'near-cap' | 'over-cap'
}

/** Thrown when managed AI returns `402` — the surprise-bill hard stop. */
export class AiBudgetError extends Error {
  constructor(
    readonly spentUsd: number,
    readonly budgetUsd: number
  ) {
    super(
      `AI budget reached — $${spentUsd.toFixed(2)} of $${budgetUsd.toFixed(2)} used this period.`
    )
    this.name = 'AiBudgetError'
  }
}

export type ManagedProviderOptions = AIProviderOptions & {
  /** Injected fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Receives the live budget after each managed call (drives the panel gauge). */
  onBudget?: (snapshot: ManagedBudgetSnapshot) => void
}

interface ManagedChatResponse {
  text?: string
  model?: string
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  spendThisPeriodUsd?: number
  includedUsd?: number
  budgetUsd?: number
  budgetState?: ManagedBudgetSnapshot['budgetState']
  error?: string
  spentUsd?: number
}

/**
 * xNet Cloud **managed** AI provider (exploration 0208).
 *
 * Posts to the hub's `/ai/chat`, which forwards to the metered control-plane
 * gateway (OpenRouter behind a per-tenant budgeted key). Unlike every other cloud
 * provider it carries **no API key** — the hub injects the per-tenant credential
 * server-side — so it is the only cloud tier safe to use without the user pasting
 * a secret. It surfaces the live budget (so the panel can render "used / included
 * / cap") and turns a `402` into a typed {@link AiBudgetError} the UI can act on.
 *
 * Model switching is per-instance: the configured `model` is sent on every call,
 * so changing the picker rebuilds the provider (same pattern as the BYO tiers).
 * No `stream` method, so the runtime uses the request/response path.
 */
export class ManagedProvider implements AIProvider {
  readonly name = 'xNet Cloud'
  private readonly baseUrl: string
  private readonly model?: string
  private readonly fetchImpl: typeof fetch
  private readonly onBudget?: (snapshot: ManagedBudgetSnapshot) => void

  constructor(options: ManagedProviderOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? '')
    this.model = options.model
    this.fetchImpl = options.fetchImpl ?? fetch
    this.onBudget = options.onBudget
  }

  getCapabilities(): AIModelCapabilities {
    return createCapabilities({
      tools: true,
      structuredOutputs: true,
      streaming: true,
      contextWindow: 200000,
      local: false,
      privacy: 'proxy',
      quality: 'strong'
    })
  }

  async generate(prompt: string): Promise<string> {
    return (await this.generateWithTools({ prompt })).text
  }

  async generateWithTools(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    // The control plane requires a model; fall back to OpenRouter's auto-router.
    const model = this.model ?? 'openrouter/auto'
    const res = await this.fetchImpl(`${this.baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include', // the hub session cookie; the hub adds the tenant secret
      body: JSON.stringify({ model, messages: requestToMessages(request) })
    })
    const data = (await res.json().catch(() => ({}))) as ManagedChatResponse
    if (res.status === 402) {
      throw new AiBudgetError(data.spentUsd ?? 0, data.budgetUsd ?? 0)
    }
    if (!res.ok) {
      throw new AIGenerationError(
        `Managed AI error: ${res.status} ${data.error ?? ''}`.trim(),
        this.name
      )
    }
    this.emitBudget(data)
    return {
      text: data.text ?? '',
      provider: this.name,
      model: data.model ?? model,
      ...(data.usage
        ? {
            usage: {
              ...(data.usage.inputTokens !== undefined
                ? { inputTokens: data.usage.inputTokens }
                : {}),
              ...(data.usage.outputTokens !== undefined
                ? { outputTokens: data.usage.outputTokens }
                : {}),
              ...(data.usage.totalTokens !== undefined
                ? { totalTokens: data.usage.totalTokens }
                : {})
            }
          }
        : {})
    }
  }

  /**
   * Stream the managed completion over SSE (`/ai/chat/stream`). Yields a `text`
   * chunk per delta, then `usage` + `done`; emits the live budget from the terminal
   * `done` event. A `402` (pre-stream) or an `ai_budget_exceeded` error event
   * becomes an {@link AiBudgetError} (exploration 0244).
   */
  async *stream(request: AIGenerateRequest): AsyncIterable<AIStreamChunk> {
    const reqModel = this.model ?? 'openrouter/auto'
    const res = await this.fetchImpl(`${this.baseUrl}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      credentials: 'include',
      body: JSON.stringify({ model: reqModel, messages: requestToMessages(request) })
    })
    if (res.status === 402) {
      const data = (await res.json().catch(() => ({}))) as ManagedChatResponse
      throw new AiBudgetError(data.spentUsd ?? 0, data.budgetUsd ?? 0)
    }
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as ManagedChatResponse
      throw new AIGenerationError(
        `Managed AI stream error: ${res.status} ${data.error ?? ''}`.trim(),
        this.name
      )
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let event = 'message'
    let model = reqModel

    const handle = (
      ev: string,
      payload: string
    ): { chunk?: AIStreamChunk; done?: boolean } | null => {
      if (!payload) return null
      const data = JSON.parse(payload) as ManagedChatResponse & { text?: string }
      if (ev === 'delta' && typeof data.text === 'string') {
        return { chunk: { type: 'text', text: data.text, provider: this.name, model } }
      }
      if (ev === 'done') {
        model = data.model ?? model
        this.emitBudget(data)
        return { done: true }
      }
      if (ev === 'error') {
        if (data.error === 'ai_budget_exceeded') {
          throw new AiBudgetError(data.spentUsd ?? 0, data.budgetUsd ?? 0)
        }
        throw new AIGenerationError(
          `Managed AI stream error: ${data.error ?? ''}`.trim(),
          this.name
        )
      }
      return null
    }

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trimEnd()
        buffer = buffer.slice(nl + 1)
        if (line === '') {
          event = 'message'
          continue
        }
        if (line.startsWith('event:')) {
          event = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          const out = handle(event, line.slice(5).trim())
          if (out?.chunk) yield out.chunk
        }
      }
    }
    yield { type: 'done', provider: this.name, model }
  }

  private emitBudget(data: ManagedChatResponse): void {
    if (!this.onBudget) return
    if (typeof data.spendThisPeriodUsd !== 'number' || typeof data.budgetUsd !== 'number') return
    this.onBudget({
      spendThisPeriodUsd: data.spendThisPeriodUsd,
      includedUsd: data.includedUsd ?? 0,
      budgetUsd: data.budgetUsd,
      budgetState: data.budgetState ?? 'included'
    })
  }
}

/** Build a {@link ManagedProvider} (parallels `createPromptApiProvider`). */
export const createManagedProvider = (options: ManagedProviderOptions = {}): ManagedProvider =>
  new ManagedProvider(options)

/**
 * Create an AI provider from configuration.
 *
 * @param config - Provider configuration
 * @returns Configured AI provider instance
 *
 * @example
 * ```typescript
 * const provider = createAIProvider({
 *   type: 'anthropic',
 *   options: { apiKey: 'sk-...' }
 * })
 * ```
 */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicProvider(config.options)
    case 'openai':
      return new OpenAIProvider(config.options)
    case 'ollama':
      return new OllamaProvider(config.options)
    case 'openai-compatible':
      return new OpenAICompatibleProvider(config.options)
    case 'managed':
      return new ManagedProvider(config.options)
    case 'openrouter':
    case 'ollama-openai':
    case 'lmstudio':
    case 'vllm':
    case 'litellm':
      return createOpenAICompatiblePresetProvider(config.type, config.options)
    case 'custom':
      throw new Error('Custom provider requires manual instantiation')
    default:
      throw new Error(`Unknown AI provider type: ${config.type}`)
  }
}

export function createAIProviderRouter(
  providers: AIProvider[],
  options: AIProviderRouterOptions = {}
): AIProviderRouter {
  return new AIProviderRouter(providers, options)
}

/**
 * Check if Ollama is available locally.
 *
 * @param baseUrl - Ollama base URL (default: http://localhost:11434)
 * @returns True if Ollama is responding
 */
export async function isOllamaAvailable(baseUrl = 'http://localhost:11434'): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * List available Ollama models.
 *
 * @param baseUrl - Ollama base URL
 * @returns Array of model names
 */
export async function listOllamaModels(baseUrl = 'http://localhost:11434'): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`)
    if (!response.ok) return []

    const data = (await response.json()) as { models: Array<{ name: string }> }
    return data.models?.map((m) => m.name) ?? []
  } catch {
    return []
  }
}
