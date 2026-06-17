/**
 * @xnetjs/plugins/connectors — agent-native Connectors (exploration 0196).
 *
 * xNet's answer to the agent-native CLI: bring an external service into governed
 * XNet nodes and expose agent-callable tools over them, so the agent operates on
 * a policy-evaluated data plane instead of holding raw credentials.
 */

export { defineConnector, ConnectorDefinitionError } from './define-connector'
export type {
  ConnectorDefinition,
  DefinedConnector,
  ConnectorSyncSpec,
  ConnectorSyncContext,
  ConnectorSyncResult,
  ConnectorStore,
  ConnectorFetch,
  ConnectorCadence
} from './define-connector'

export { runConnectorSync, ConnectorSyncError } from './sync-runner'
export type { RunConnectorSyncPorts, GuardableConnectorStore } from './sync-runner'
