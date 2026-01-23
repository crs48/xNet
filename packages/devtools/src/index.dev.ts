/**
 * @xnet/devtools - Development entry point
 *
 * Full DevToolsProvider with all panels, instrumentation, and UI.
 * Selected by the bundler when the "development" condition is active.
 */

export { DevToolsProvider } from './provider/DevToolsProvider'
export type { DevToolsProviderProps } from './provider/DevToolsProvider'
export { useDevTools } from './provider/useDevTools'
export type { DevToolsEvent, DevToolsEventType } from './core/types'

// Re-export instrumentation for advanced usage
export { DevToolsEventBus } from './core/event-bus'
export type { DevToolsEventBusOptions } from './core/event-bus'
export { instrumentStore } from './instrumentation/store'
export { instrumentSync } from './instrumentation/sync'
export { instrumentYDoc } from './instrumentation/yjs'
export { instrumentTelemetry } from './instrumentation/telemetry'
export type { InstrumentTelemetryOptions } from './instrumentation/telemetry'
export { QueryTracker, captureCallerInfo } from './instrumentation/query'
