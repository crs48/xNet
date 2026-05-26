/**
 * Sandbox module - Secure script execution for user scripts
 */

// Context
export { createScriptContext } from './context'
export type {
  ScriptContext,
  FlatNode,
  FormatHelpers,
  MathHelpers,
  TextHelpers,
  ArrayHelpers
} from './context'

// AST Validator
export { validateScriptAST, quickSafetyCheck } from './ast-validator'
export type { ValidationResult } from './ast-validator'

// Sandbox
export {
  ScriptSandbox,
  ScriptError,
  ScriptTimeoutError,
  ScriptValidationError,
  executeScript,
  validateScript
} from './sandbox'
export type { SandboxOptions, TelemetryReporter } from './sandbox'

// Runner
export { ScriptRunner } from './runner'
export type {
  ScriptStore,
  ScriptNodeChangeEvent,
  ScriptRunnerOptions,
  ScriptExecutionResult
} from './runner'

// Canvas renderer and preview sandbox policies
export {
  createCanvasPluginSandboxPolicy,
  createCanvasPreviewSandboxRequest,
  createCanvasRendererSandboxRequest,
  evaluateCanvasPluginSandboxRequest,
  validateCanvasPluginSandboxOutput
} from './canvas'
export type {
  CanvasPluginSandboxDecision,
  CanvasPluginSandboxDomAccess,
  CanvasPluginSandboxKind,
  CanvasPluginSandboxMutationAccess,
  CanvasPluginSandboxNetworkAccess,
  CanvasPluginSandboxOutput,
  CanvasPluginSandboxOutputKind,
  CanvasPluginSandboxOutputValidation,
  CanvasPluginSandboxPolicy,
  CanvasPluginSandboxRequest,
  CanvasRendererSandboxContribution
} from './canvas'
