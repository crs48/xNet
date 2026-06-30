/**
 * Bring-Your-Own-Model connectors (exploration 0174).
 *
 * Tiered, self-detecting model access for the AI chat panel.
 */

export type {
  ConnectorTier,
  ToolCallingFidelity,
  WriteMode,
  ConnectorEnv,
  LocalServerProbe,
  ConnectorDetection
} from './types'
export { writeModeFor } from './types'
export {
  CONNECTOR_META,
  detectConnectors,
  pickBestConnector,
  defaultLocalServerProbes,
  probeOpenAiCompatible
} from './detect'
export { WebLLMProvider, createWebLLMProvider } from './webllm-provider'
export type { WebLLMEngineLike, WebLLMProviderOptions } from './webllm-provider'
export {
  PromptApiProvider,
  createPromptApiProvider,
  promptApiAvailability,
  downloadPromptApiModel
} from './prompt-api-provider'
export type {
  LanguageModelLike,
  LanguageModelSessionLike,
  LanguageModelMonitor,
  PromptApiAvailability,
  PromptApiProviderOptions
} from './prompt-api-provider'
