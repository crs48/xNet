/**
 * @xnet/plugins - Plugin system for extending xNet
 *
 * Provides infrastructure for:
 * - Plugin registration and lifecycle management
 * - Extension points (views, commands, editor extensions, etc.)
 * - NodeStore middleware for pre/post change hooks
 * - Plugin storage as Nodes for P2P sync
 */

// Core types
export type {
  Disposable,
  Platform,
  PluginPermissions,
  PlatformCapabilities,
  ExtensionStorage
} from './types'
export { getPlatformCapabilities, createExtensionStorage } from './types'

// Manifest
export type { XNetExtension, PluginContributions } from './manifest'
export { validateManifest, defineExtension, PluginValidationError } from './manifest'

// Contributions
export type {
  ViewContribution,
  ViewProps,
  CommandContribution,
  SlashCommandContribution,
  SlashCommandContext,
  EditorContribution,
  ToolbarContribution,
  SidebarContribution,
  PropertyHandlerContribution,
  PropertyHandler,
  PropertyCellProps,
  PropertyEditorProps,
  BlockContribution,
  BlockProps,
  SettingContribution,
  SettingsPanelProps,
  SchemaContribution
} from './contributions'
export { TypedRegistry, ContributionRegistry } from './contributions'

// Shortcuts
export { ShortcutManager, getShortcutManager, installShortcutHandler } from './shortcuts'

// Middleware
export type { PendingChange, NodeChangeEvent, NodeStoreMiddleware } from './middleware'
export { MiddlewareChain } from './middleware'

// Context
export type {
  ExtensionContext,
  PluginNodeChangeEvent,
  PluginNodeChangeListener,
  QueryFilter
} from './context'
export { createExtensionContext } from './context'

// Registry
export type { PluginStatus, RegisteredPlugin } from './registry'
export { PluginRegistry, PluginError } from './registry'

// Schemas
export { PluginSchema } from './schemas/plugin'
export type { PluginNode } from './schemas/plugin'
export { ScriptSchema, isScriptNode } from './schemas/script'
export type { ScriptNode, ScriptTriggerType, ScriptOutputType } from './schemas/script'

// Sandbox (Script execution)
export {
  // Context
  createScriptContext,
  // Validator
  validateScriptAST,
  quickSafetyCheck,
  // Sandbox
  ScriptSandbox,
  ScriptError,
  ScriptTimeoutError,
  ScriptValidationError,
  executeScript,
  validateScript,
  // Runner
  ScriptRunner
} from './sandbox'
export type {
  // Context types
  ScriptContext,
  FlatNode,
  FormatHelpers,
  MathHelpers,
  TextHelpers,
  ArrayHelpers,
  // Validator types
  ValidationResult,
  // Sandbox types
  SandboxOptions,
  // Runner types
  ScriptStore,
  ScriptNodeChangeEvent,
  ScriptRunnerOptions,
  ScriptExecutionResult
} from './sandbox'

// AI (Script generation from natural language)
export {
  // Prompt building
  buildScriptPrompt,
  buildRetryPrompt,
  // Providers
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  createAIProvider,
  isOllamaAvailable,
  listOllamaModels,
  AIGenerationError,
  // Generator
  ScriptGenerator,
  ScriptGenerationError,
  generateScript
} from './ai'
export type {
  // Prompt types
  AIScriptRequest,
  SchemaProperty,
  SchemaDefinition,
  // Provider types
  AIProvider,
  AIProviderOptions,
  AIProviderType,
  AIProviderConfig,
  // Generator types
  AIScriptResponse,
  ScriptGeneratorOptions
} from './ai'
