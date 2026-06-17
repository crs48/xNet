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
export {
  AiAgentRuntime,
  classifyAiAgentDisplayState,
  createAiAgentRuntime,
  createMemoryAiAgentRuntimeStorage,
  renderSelectionPrompt
} from './runtime'

// Bring-Your-Own-Model connectors (exploration 0174)
export {
  CONNECTOR_META,
  detectConnectors,
  pickBestConnector,
  defaultLocalServerProbes,
  probeOpenAiCompatible,
  writeModeFor,
  WebLLMProvider,
  createWebLLMProvider,
  PromptApiProvider,
  createPromptApiProvider
} from './connectors'
export type {
  ConnectorTier,
  ToolCallingFidelity,
  WriteMode,
  ConnectorEnv,
  LocalServerProbe,
  ConnectorDetection,
  WebLLMEngineLike,
  WebLLMProviderOptions,
  LanguageModelLike,
  LanguageModelSessionLike,
  PromptApiProviderOptions
} from './connectors'
export type {
  AiAgentApproval,
  AiAgentApprovalRequestInput,
  AiAgentApprovalResolveInput,
  AiAgentApprovalStatus,
  AiAgentBackgroundJob,
  AiAgentBackgroundJobInput,
  AiAgentBackgroundJobRunner,
  AiAgentBackgroundJobStatus,
  AiAgentContextProvider,
  AiAgentDisplayState,
  AiAgentDisplayStateKind,
  AiAgentEvent,
  AiAgentEventType,
  AiAgentOrchestratorMode,
  AiAgentRunSelectionTurnInput,
  AiAgentRunTurnInput,
  AiAgentRunTurnResult,
  AiAgentRuntimeConfig,
  AiAgentRuntimeListener,
  AiAgentRuntimeSnapshot,
  AiAgentRuntimeStorage,
  AiAgentSelectionContext,
  AiAgentSelectionKind,
  AiAgentTelemetrySnapshot,
  AiAgentThread,
  AiAgentThreadCreateInput,
  AiAgentThreadStatus,
  AiAgentTurn,
  AiAgentTurnRole,
  AiAgentTurnStatus
} from './runtime'
