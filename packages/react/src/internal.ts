/**
 * @xnet/react internal exports
 *
 * Used by @xnet/devtools for store access and instrumentation wiring.
 * NOT part of the public API.
 */

export { useNodeStore, type NodeStoreContextValue } from './hooks/useNodeStore'
export {
  InstrumentationContext,
  useInstrumentation,
  type InstrumentationContextValue,
  type QueryTrackerLike,
  type YDocRegistryLike
} from './instrumentation'
