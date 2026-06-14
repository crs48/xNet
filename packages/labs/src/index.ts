/**
 * @xnetjs/labs — code as a first-class citizen (exploration 0180).
 *
 * A Lab is a node that holds code + a runtime tier; the {@link RuntimeLadder}
 * runs it on the right rung (SES → QuickJS → iframe → Pyodide → server), and
 * {@link publishLabAsExtension} turns it into a live workbench extension.
 */

// Schema
export {
  LabSchema,
  LAB_SCHEMA_IRI,
  LAB_LANGUAGE_OPTIONS,
  LAB_RUNTIME_OPTIONS,
  isLabLanguage,
  isLabRuntimeTier
} from './schema'
export type { LabNode } from './schema'

// Runtime types
export type {
  LabLanguage,
  LabRuntimeTier,
  LabTrustTier,
  LabLogLevel,
  LabLogEntry,
  LabRunResult,
  LabRunInput,
  LabRuntime,
  LabHostTool,
  LabHostBridge
} from './runtime/types'
export { sanitizeValue, formatLogArgs } from './runtime/types'

// Ladder
export { RuntimeLadder, LabRuntimeError } from './runtime/ladder'
export type { LadderPick, LadderRunInput } from './runtime/ladder'
export {
  createDefaultLadder,
  createServerRuntime,
  sesRuntime,
  quickjsRuntime,
  appRuntime,
  pythonRuntime
} from './runtime/runtimes'
export type { DefaultLadderOptions } from './runtime/runtimes'

// Engines (direct access)
export { runSes, lockdownRealm } from './runtime/ses'
export { runQuickjs, isQuickjsAvailable, __resetQuickjsForTests } from './runtime/quickjs'
export { runApp, buildAppFrameSrcdoc, APP_FRAME_SANDBOX } from './runtime/app'
export type { LabFrameMessage } from './runtime/app'
export { runPython, isPythonAvailable, setPyodideLoader } from './runtime/python'
export type { PyodideLike, PyodideLoader } from './runtime/python'
export {
  createServerRuntimeRunner,
  createHttpServerExecBackend
} from './runtime/server'
export type {
  ServerExecBackend,
  ServerExecRequest,
  ServerExecResponse,
  ServerRuntimeOptions,
  WasmRunner
} from './runtime/server'

// Transpilation
export {
  identityTranspiler,
  createSwcTranspiler,
  isJsTranspilable
} from './runtime/transpile'
export type { Transpiler, SwcModuleLike } from './runtime/transpile'

// Host bridge
export {
  createLabHostBridge,
  bridgeToGlobal,
  isSchemaReadable,
  LabPermissionError
} from './host'
export type { LabStore } from './host'

// Trust
export { deriveTrustTier, requiresCapabilityReprompt } from './trust'
export type { LabInstallSource } from './trust'

// Extension publishing
export {
  buildLabExtensionManifest,
  publishLabAsExtension,
  slugifyForId
} from './extension'
export type {
  LabExtensionOptions,
  LabExtensionInstaller,
  PublishLabRequest,
  PublishLabResult
} from './extension'
