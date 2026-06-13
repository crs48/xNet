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
