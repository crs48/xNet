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
  OpenAICompatibleProvider,
  AIProviderRouter,
  createAIProvider,
  createAIProviderRouter,
  isOllamaAvailable,
  listOllamaModels,
  AIGenerationError
} from './providers'
export type {
  AIComplexityLevel,
  AICostModel,
  AIGenerateRequest,
  AIGenerateResponse,
  AIMessage,
  AIMessageRole,
  AIModelCapabilities,
  AIModelQuality,
  AIPrivacyLevel,
  AIProvider,
  AIProviderConfig,
  AIProviderOptions,
  AIProviderRouterOptions,
  AIProviderType,
  AIProviderUsage,
  AIRiskLevel,
  AIStreamChunk,
  AIToolCall,
  AIToolSpec,
  AIUsage,
  OpenAICompatibleProviderOptions
} from './providers'

// Generator
export { ScriptGenerator, ScriptGenerationError, generateScript } from './generator'
export type { AIScriptResponse, ScriptGeneratorOptions } from './generator'

// Agent runtime
export { AiAgentRuntime, createAiAgentRuntime, createMemoryAiAgentRuntimeStorage } from './runtime'
export type {
  AiAgentApproval,
  AiAgentApprovalRequestInput,
  AiAgentApprovalResolveInput,
  AiAgentApprovalStatus,
  AiAgentBackgroundJob,
  AiAgentBackgroundJobInput,
  AiAgentBackgroundJobRunner,
  AiAgentBackgroundJobStatus,
  AiAgentEvent,
  AiAgentEventType,
  AiAgentOrchestratorMode,
  AiAgentRunTurnInput,
  AiAgentRunTurnResult,
  AiAgentRuntimeConfig,
  AiAgentRuntimeListener,
  AiAgentRuntimeSnapshot,
  AiAgentRuntimeStorage,
  AiAgentTelemetrySnapshot,
  AiAgentThread,
  AiAgentThreadCreateInput,
  AiAgentThreadStatus,
  AiAgentTurn,
  AiAgentTurnRole,
  AiAgentTurnStatus
} from './runtime'
