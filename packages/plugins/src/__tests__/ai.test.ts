/**
 * Tests for AI script generation module
 */
import { describe, it, expect, vi } from 'vitest'
import { ScriptGenerator, ScriptGenerationError, generateScript } from '../ai/generator'
import {
  buildScriptPrompt,
  buildRetryPrompt,
  type AIScriptRequest,
  type SchemaDefinition
} from '../ai/prompt'
import {
  AnthropicProvider,
  AIProviderRouter,
  OpenAICompatibleProvider,
  OpenAIProvider,
  OllamaProvider,
  createAIProvider,
  AIGenerationError,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIModelCapabilities,
  type AIProvider
} from '../ai/providers'

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const testSchema: SchemaDefinition = {
  name: 'Invoice',
  schemaIRI: 'xnet://myapp/Invoice',
  properties: [
    { name: 'subtotal', type: 'number', required: true, description: 'Invoice subtotal' },
    { name: 'taxRate', type: 'number', description: 'Tax rate as decimal' },
    { name: 'status', type: 'string' }
  ]
}

const basicRequest: AIScriptRequest = {
  intent: 'Calculate total with 8% tax',
  schema: testSchema,
  outputType: 'value'
}

/**
 * Mock AI provider for testing
 */
class MockAIProvider implements AIProvider {
  readonly name = 'Mock'
  private responses: string[]
  private callIndex = 0

  constructor(responses: string | string[]) {
    this.responses = Array.isArray(responses) ? responses : [responses]
  }

  async generate(_prompt: string): Promise<string> {
    if (this.callIndex >= this.responses.length) {
      return this.responses[this.responses.length - 1]
    }
    return this.responses[this.callIndex++]
  }
}

/**
 * Mock AI provider that throws errors
 */
class ErrorAIProvider implements AIProvider {
  readonly name = 'ErrorMock'
  private error: Error
  private callsBeforeError: number
  private callCount = 0

  constructor(error: Error, callsBeforeError = 0) {
    this.error = error
    this.callsBeforeError = callsBeforeError
  }

  async generate(_prompt: string): Promise<string> {
    this.callCount++
    if (this.callCount > this.callsBeforeError) {
      throw this.error
    }
    return '(node) => node.value'
  }
}

// ─── Prompt Building Tests ───────────────────────────────────────────────────

describe('buildScriptPrompt', () => {
  it('includes schema information', () => {
    const prompt = buildScriptPrompt(basicRequest)

    expect(prompt).toContain('Schema: Invoice')
    expect(prompt).toContain('xnet://myapp/Invoice')
    expect(prompt).toContain('node.subtotal')
    expect(prompt).toContain('node.taxRate')
    expect(prompt).toContain('(required)')
  })

  it('includes output type description', () => {
    const prompt = buildScriptPrompt(basicRequest)

    expect(prompt).toContain('Output Type: value')
    expect(prompt).toContain('computed value')
  })

  it('includes trigger type description', () => {
    const request: AIScriptRequest = {
      ...basicRequest,
      triggerType: 'onChange'
    }
    const prompt = buildScriptPrompt(request)

    expect(prompt).toContain('Trigger: onChange')
    expect(prompt).toContain('automatically')
  })

  it('includes API documentation', () => {
    const prompt = buildScriptPrompt(basicRequest)

    expect(prompt).toContain('ctx.format.date')
    expect(prompt).toContain('ctx.math.sum')
    expect(prompt).toContain('ctx.text.slugify')
    expect(prompt).toContain('ctx.array.sortBy')
    expect(prompt).toContain('ctx.nodes')
  })

  it('includes critical constraints', () => {
    const prompt = buildScriptPrompt(basicRequest)

    expect(prompt).toContain('NO imports')
    expect(prompt).toContain('NO fetch')
    expect(prompt).toContain('NO async/await')
    expect(prompt).toContain('NO eval')
    expect(prompt).toContain('Pure synchronous function')
  })

  it('includes user intent', () => {
    const prompt = buildScriptPrompt(basicRequest)

    expect(prompt).toContain('Calculate total with 8% tax')
  })

  it('includes example data when provided', () => {
    const request: AIScriptRequest = {
      ...basicRequest,
      examples: [
        { id: '1', schemaIRI: 'xnet://myapp/Invoice', subtotal: 100, taxRate: 0.08 },
        { id: '2', schemaIRI: 'xnet://myapp/Invoice', subtotal: 250, taxRate: 0.1 }
      ]
    }
    const prompt = buildScriptPrompt(request)

    expect(prompt).toContain('Sample Data')
    expect(prompt).toContain('100')
    expect(prompt).toContain('0.08')
  })

  it('includes additional constraints when provided', () => {
    const request: AIScriptRequest = {
      ...basicRequest,
      constraints: ['Round to 2 decimal places', 'Handle null values']
    }
    const prompt = buildScriptPrompt(request)

    expect(prompt).toContain('Additional Requirements')
    expect(prompt).toContain('Round to 2 decimal places')
    expect(prompt).toContain('Handle null values')
  })

  it('handles empty properties list', () => {
    const request: AIScriptRequest = {
      ...basicRequest,
      schema: { ...testSchema, properties: [] }
    }
    const prompt = buildScriptPrompt(request)

    expect(prompt).toContain('(No properties defined)')
  })

  it('handles different output types', () => {
    const mutationRequest: AIScriptRequest = {
      ...basicRequest,
      outputType: 'mutation'
    }
    const prompt = buildScriptPrompt(mutationRequest)

    expect(prompt).toContain('Output Type: mutation')
    expect(prompt).toContain('property updates')
  })
})

describe('buildRetryPrompt', () => {
  it('appends validation errors to original prompt', () => {
    const original = 'Generate a script'
    const errors = ['Forbidden global: window', 'async/await not allowed']

    const retry = buildRetryPrompt(original, errors)

    expect(retry).toContain(original)
    expect(retry).toContain('IMPORTANT')
    expect(retry).toContain('validation errors')
    expect(retry).toContain('Forbidden global: window')
    expect(retry).toContain('async/await not allowed')
  })
})

// ─── Provider Tests ──────────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
  it('requires API key', () => {
    expect(() => new AnthropicProvider({})).toThrow('API key is required')
  })

  it('has correct default model', () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    expect(provider.name).toBe('Anthropic')
  })

  it('handles API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Invalid API key')
    })

    const provider = new AnthropicProvider({ apiKey: 'bad-key' })

    await expect(provider.generate('test')).rejects.toThrow(AIGenerationError)
  })

  it('handles empty response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [] })
    })

    const provider = new AnthropicProvider({ apiKey: 'test-key' })

    await expect(provider.generate('test')).rejects.toThrow('No text content')
  })

  it('extracts text from valid response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: '(node) => node.value * 1.08' }]
        })
    })

    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    const result = await provider.generate('test')

    expect(result).toBe('(node) => node.value * 1.08')
  })
})

describe('OpenAIProvider', () => {
  it('requires API key', () => {
    expect(() => new OpenAIProvider({})).toThrow('API key is required')
  })

  it('has correct default model', () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' })
    expect(provider.name).toBe('OpenAI')
  })

  it('handles API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited')
    })

    const provider = new OpenAIProvider({ apiKey: 'test-key' })

    await expect(provider.generate('test')).rejects.toThrow(AIGenerationError)
  })

  it('extracts content from valid response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '(node) => node.total' } }]
        })
    })

    const provider = new OpenAIProvider({ apiKey: 'test-key' })
    const result = await provider.generate('test')

    expect(result).toBe('(node) => node.total')
  })
})

describe('OpenAICompatibleProvider', () => {
  it('sends tools and structured response schemas to chat completions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '{"summary":"done"}',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'xnet_database_query',
                      arguments: '{"databaseId":"db1","limit":10}'
                    }
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500
          }
        })
    })
    global.fetch = fetchMock

    const provider = new OpenAICompatibleProvider({
      providerName: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/',
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      capabilities: {
        cost: {
          inputPerMillion: 1,
          outputPerMillion: 2,
          currency: 'USD'
        }
      }
    })

    const result = await provider.generateWithTools({
      messages: [{ role: 'user', content: 'Summarize invoices' }],
      tools: [
        {
          name: 'xnet_database_query',
          description: 'Query a database',
          inputSchema: {
            type: 'object',
            properties: {
              databaseId: { type: 'string' }
            },
            required: ['databaseId']
          }
        }
      ],
      responseSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' }
        },
        required: ['summary']
      }
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      tools: Array<{ function: { name: string; parameters: Record<string, unknown> } }>
      response_format: { type: string; json_schema: { schema: Record<string, unknown> } }
    }

    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers).toMatchObject({
      authorization: 'Bearer test-key'
    })
    expect(body.tools[0].function.name).toBe('xnet_database_query')
    expect(body.response_format.type).toBe('json_schema')
    expect(result.provider).toBe('OpenRouter')
    expect(result.toolCalls?.[0]).toMatchObject({
      id: 'call_1',
      name: 'xnet_database_query',
      arguments: {
        databaseId: 'db1',
        limit: 10
      }
    })
    expect(result.usage?.estimatedCostUsd).toBe(0.002)
  })

  it('streams text chunks from server-sent events', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream
    })

    const provider = new OpenAICompatibleProvider({
      providerName: 'LM Studio',
      baseUrl: 'http://localhost:1234',
      model: 'local-model',
      capabilities: {
        local: true,
        privacy: 'local',
        cost: undefined
      }
    })

    const chunks = []
    for await (const chunk of provider.stream({ prompt: 'hello' })) {
      chunks.push(chunk)
    }

    expect(chunks).toContainEqual({
      type: 'text',
      text: 'hello',
      provider: 'LM Studio',
      model: 'local-model'
    })
    expect(chunks.at(-1)).toEqual({
      type: 'done',
      provider: 'LM Studio',
      model: 'local-model'
    })
  })
})

describe('OllamaProvider', () => {
  it('has default base URL', () => {
    const provider = new OllamaProvider()
    expect(provider.name).toBe('Ollama')
  })

  it('handles API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Model not found')
    })

    const provider = new OllamaProvider()

    await expect(provider.generate('test')).rejects.toThrow(AIGenerationError)
  })

  it('extracts response from valid response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          response: '(node) => ctx.math.sum([node.a, node.b])'
        })
    })

    const provider = new OllamaProvider()
    const result = await provider.generate('test')

    expect(result).toBe('(node) => ctx.math.sum([node.a, node.b])')
  })
})

describe('createAIProvider', () => {
  it('creates Anthropic provider', () => {
    const provider = createAIProvider({
      type: 'anthropic',
      options: { apiKey: 'test' }
    })
    expect(provider.name).toBe('Anthropic')
  })

  it('creates OpenAI provider', () => {
    const provider = createAIProvider({
      type: 'openai',
      options: { apiKey: 'test' }
    })
    expect(provider.name).toBe('OpenAI')
  })

  it('creates Ollama provider', () => {
    const provider = createAIProvider({
      type: 'ollama',
      options: {}
    })
    expect(provider.name).toBe('Ollama')
  })

  it('creates OpenAI-compatible endpoint providers', () => {
    const openRouter = createAIProvider({
      type: 'openrouter',
      options: { apiKey: 'test' }
    })
    const ollamaCompatible = createAIProvider({
      type: 'ollama-openai',
      options: {}
    })
    const lmStudio = createAIProvider({
      type: 'lmstudio',
      options: {}
    })
    const vllm = createAIProvider({
      type: 'vllm',
      options: {}
    })
    const liteLlm = createAIProvider({
      type: 'litellm',
      options: {}
    })

    expect(openRouter.name).toBe('OpenRouter')
    expect(ollamaCompatible.name).toBe('Ollama')
    expect(lmStudio.name).toBe('LM Studio')
    expect(vllm.name).toBe('vLLM')
    expect(liteLlm.name).toBe('LiteLLM')
  })

  it('throws for custom type', () => {
    expect(() =>
      createAIProvider({
        type: 'custom',
        options: {}
      })
    ).toThrow('manual instantiation')
  })

  it('throws for unknown type', () => {
    expect(() =>
      createAIProvider({
        type: 'unknown' as never,
        options: {}
      })
    ).toThrow('Unknown AI provider')
  })
})

describe('AIProviderRouter', () => {
  class RoutingProvider implements AIProvider {
    requests: AIGenerateRequest[] = []

    constructor(
      readonly name: string,
      private readonly capabilities: AIModelCapabilities,
      private readonly response: AIGenerateResponse
    ) {}

    async generate(prompt: string): Promise<string> {
      this.requests.push({ prompt })
      return this.response.text
    }

    async generateWithTools(request: AIGenerateRequest): Promise<AIGenerateResponse> {
      this.requests.push(request)
      return {
        ...this.response,
        provider: this.name
      }
    }

    getCapabilities(): AIModelCapabilities {
      return this.capabilities
    }
  }

  const localCapabilities: AIModelCapabilities = {
    tools: false,
    structuredOutputs: false,
    streaming: false,
    contextWindow: 8192,
    local: true,
    privacy: 'local',
    quality: 'local'
  }

  const strongCapabilities: AIModelCapabilities = {
    tools: true,
    structuredOutputs: true,
    streaming: true,
    contextWindow: 128000,
    local: false,
    privacy: 'cloud',
    quality: 'strong',
    cost: {
      inputPerMillion: 2,
      outputPerMillion: 6,
      currency: 'USD'
    }
  }

  it('routes low-risk prompts to local providers and high-complexity plans to strong providers', async () => {
    const local = new RoutingProvider('Local', localCapabilities, {
      text: 'local summary',
      provider: 'Local',
      model: 'local-model'
    })
    const strong = new RoutingProvider('Strong', strongCapabilities, {
      text: '{"plan":[]}',
      provider: 'Strong',
      model: 'strong-model',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.0005
      }
    })
    const router = new AIProviderRouter([local, strong])

    const localResponse = await router.generateWithTools({
      prompt: 'Summarize selected text',
      risk: 'low',
      complexity: 'low'
    })
    const strongResponse = await router.generateWithTools({
      prompt: 'Plan database writes',
      risk: 'high',
      complexity: 'high',
      tools: [{ name: 'xnet_database_plan_mutation' }],
      responseSchema: { type: 'object' }
    })

    expect(localResponse.provider).toBe('Local')
    expect(strongResponse.provider).toBe('Strong')
    expect(local.requests).toHaveLength(1)
    expect(strong.requests).toHaveLength(1)
    expect(router.getUsage()).toMatchObject({
      Local: { requests: 1 },
      Strong: {
        requests: 1,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.0005
      }
    })
  })
})

// ─── Script Generator Tests ──────────────────────────────────────────────────

describe('ScriptGenerator', () => {
  describe('extractCode', () => {
    it('extracts code from markdown fences', async () => {
      const mockProvider = new MockAIProvider(
        '```javascript\n(node, ctx) => node.subtotal * 1.08\n```'
      )
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate(basicRequest)

      expect(result.code).toBe('(node, ctx) => node.subtotal * 1.08')
    })

    it('extracts code from typescript fences', async () => {
      const mockProvider = new MockAIProvider('```typescript\n(node, ctx) => node.amount\n```')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate(basicRequest)

      expect(result.code).toBe('(node, ctx) => node.amount')
    })

    it('extracts code from single backticks', async () => {
      const mockProvider = new MockAIProvider('`(node) => node.value`')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate(basicRequest)

      expect(result.code).toBe('(node) => node.value')
    })

    it('handles plain arrow function', async () => {
      const mockProvider = new MockAIProvider('(node, ctx) => node.total * 1.08')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate(basicRequest)

      expect(result.code).toBe('(node, ctx) => node.total * 1.08')
    })
  })

  describe('validation', () => {
    it('validates generated code', async () => {
      const validCode = '(node, ctx) => node.subtotal * 1.08'
      const mockProvider = new MockAIProvider(validCode)
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate(basicRequest)

      expect(result.validated).toBe(true)
      expect(result.attempts).toBe(1)
    })

    it('retries on validation failure', async () => {
      // First response has forbidden global, second is valid
      const mockProvider = new MockAIProvider([
        '(node) => window.alert(node.value)',
        '(node) => node.value * 1.08'
      ])
      const generator = new ScriptGenerator(mockProvider, { maxRetries: 2 })

      const result = await generator.generate(basicRequest)

      expect(result.validated).toBe(true)
      expect(result.attempts).toBe(2)
    })

    it('returns invalid code when retries exhausted and throwOnValidationFailure is false', async () => {
      const invalidCode = '(node) => eval(node.code)'
      const mockProvider = new MockAIProvider(invalidCode)
      const generator = new ScriptGenerator(mockProvider, {
        maxRetries: 1,
        throwOnValidationFailure: false
      })

      const result = await generator.generate(basicRequest)

      expect(result.validated).toBe(false)
    })

    it('throws when retries exhausted and throwOnValidationFailure is true', async () => {
      const invalidCode = '(node) => fetch("/api")'
      const mockProvider = new MockAIProvider(invalidCode)
      const generator = new ScriptGenerator(mockProvider, {
        maxRetries: 1,
        throwOnValidationFailure: true
      })

      await expect(generator.generate(basicRequest)).rejects.toThrow(ScriptGenerationError)
    })
  })

  describe('response metadata', () => {
    it('generates suggested name from intent', async () => {
      const mockProvider = new MockAIProvider('(node) => node.a + node.b')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate(basicRequest)

      expect(result.suggestedName).toBe('calculateTotalWithTax')
    })

    it('generates explanation', async () => {
      const mockProvider = new MockAIProvider('(node) => node.subtotal * 1.08')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate(basicRequest)

      expect(result.explanation).toContain('Calculates')
    })

    it('infers trigger type for value output', async () => {
      const mockProvider = new MockAIProvider('(node) => node.value')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate({
        ...basicRequest,
        outputType: 'value'
      })

      expect(result.suggestedTrigger).toBe('onView')
    })

    it('uses provided trigger type', async () => {
      const mockProvider = new MockAIProvider('(node) => ({ status: "done" })')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate({
        ...basicRequest,
        outputType: 'mutation',
        triggerType: 'onChange'
      })

      expect(result.suggestedTrigger).toBe('onChange')
    })

    it('infers onChange for automatic mutations', async () => {
      const mockProvider = new MockAIProvider('(node) => ({ status: "done" })')
      const generator = new ScriptGenerator(mockProvider)

      const result = await generator.generate({
        ...basicRequest,
        intent: 'Automatically mark as done when complete',
        outputType: 'mutation'
      })

      expect(result.suggestedTrigger).toBe('onChange')
    })
  })

  describe('error handling', () => {
    it('handles AI generation errors', async () => {
      const errorProvider = new ErrorAIProvider(new Error('API quota exceeded'))
      const generator = new ScriptGenerator(errorProvider, { maxRetries: 0 })

      await expect(generator.generate(basicRequest)).rejects.toThrow(ScriptGenerationError)
    })

    it('includes attempt count in error', async () => {
      const errorProvider = new ErrorAIProvider(new Error('Network error'))
      const generator = new ScriptGenerator(errorProvider, { maxRetries: 2 })

      try {
        await generator.generate(basicRequest)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ScriptGenerationError)
        expect((err as ScriptGenerationError).attempts).toBe(3)
      }
    })
  })
})

describe('generateScript', () => {
  it('is a convenience function that uses ScriptGenerator', async () => {
    const mockProvider = new MockAIProvider('(node) => node.value')

    const result = await generateScript(mockProvider, basicRequest)

    expect(result.validated).toBe(true)
    expect(result.code).toBe('(node) => node.value')
  })
})
