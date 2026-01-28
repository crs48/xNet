/**
 * AI module - Script generation from natural language
 */

// Prompt building
export { buildScriptPrompt, buildRetryPrompt } from './prompt'
export type { AIScriptRequest, SchemaProperty, SchemaDefinition } from './prompt'

// Providers
export {
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  createAIProvider,
  isOllamaAvailable,
  listOllamaModels,
  AIGenerationError
} from './providers'
export type { AIProvider, AIProviderOptions, AIProviderType, AIProviderConfig } from './providers'

// Generator
export { ScriptGenerator, ScriptGenerationError, generateScript } from './generator'
export type { AIScriptResponse, ScriptGeneratorOptions } from './generator'
