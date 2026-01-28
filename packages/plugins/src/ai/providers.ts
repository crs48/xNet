/**
 * AI Provider Abstraction
 *
 * Defines a common interface for AI providers and includes
 * implementations for Anthropic, OpenAI, and local (Ollama).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Common interface for AI text generation providers
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
}

/**
 * Options for configuring AI providers
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
}

/**
 * AI provider type identifier
 */
export type AIProviderType = 'anthropic' | 'openai' | 'ollama' | 'custom'

/**
 * Configuration for selecting an AI provider
 */
export interface AIProviderConfig {
  type: AIProviderType
  options: AIProviderOptions
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Error thrown when AI generation fails
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

  constructor(options: AIProviderOptions) {
    if (!options.apiKey) {
      throw new Error('Anthropic API key is required')
    }
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com'
    this.model = options.model ?? 'claude-sonnet-4-20250514'
    this.maxTokens = options.maxTokens ?? 2048
    this.temperature = options.temperature ?? 0.3
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
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
export class OpenAIProvider implements AIProvider {
  readonly name = 'OpenAI'
  private apiKey: string
  private baseUrl: string
  private model: string
  private maxTokens: number
  private temperature: number

  constructor(options: AIProviderOptions) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required')
    }
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com'
    this.model = options.model ?? 'gpt-4o'
    this.maxTokens = options.maxTokens ?? 2048
    this.temperature = options.temperature ?? 0.3
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`
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
        throw new AIGenerationError(`OpenAI API error: ${response.status} ${error}`, this.name)
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
      }

      if (!data.choices?.[0]?.message?.content) {
        throw new AIGenerationError('No content in response', this.name)
      }

      return data.choices[0].message.content
    } catch (err) {
      if (err instanceof AIGenerationError) throw err
      throw new AIGenerationError(
        `OpenAI generation failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err
      )
    }
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

// ─── Provider Factory ────────────────────────────────────────────────────────

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
    case 'custom':
      throw new Error('Custom provider requires manual instantiation')
    default:
      throw new Error(`Unknown AI provider type: ${config.type}`)
  }
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
