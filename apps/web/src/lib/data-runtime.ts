/**
 * Shim (0406): canonical module lives in @xnetjs/workbench. New code
 * imports the package directly.
 */
export {
  DATA_RUNTIME_STORAGE_KEY,
  DEFAULT_DATA_RUNTIME,
  getDataRuntime,
  isWorkerRuntimeEnabled,
  resolveDataRuntime,
  type DataRuntime
} from '@xnetjs/workbench'
