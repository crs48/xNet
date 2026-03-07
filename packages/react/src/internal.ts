/**
 * @xnetjs/react internal exports
 *
 * Used by @xnetjs/devtools for store access and instrumentation wiring.
 * NOT part of the public API.
 */

export { useNodeStore, type NodeStoreContextValue } from './hooks/useNodeStore'
export {
  useUndoScope,
  type UseUndoScopeOptions,
  type UseUndoScopeResult
} from './hooks/useUndoScope'
export {
  InstrumentationContext,
  useInstrumentation,
  type InstrumentationContextValue,
  type QueryTrackerLike,
  type YDocRegistryLike
} from './instrumentation'
export { useDataBridge, useXNet } from './context'
export type { XNetContextValue } from './context'
export type { XNetRuntimeStatus } from './runtime'
