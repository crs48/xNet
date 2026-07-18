/**
 * @xnetjs/plugins/connectors — agent-native Connectors (exploration 0196).
 *
 * xNet's answer to the agent-native CLI: bring an external service into governed
 * xNet nodes and expose agent-callable tools over them, so the agent operates on
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

export {
  CONNECTOR_CATEGORY,
  emitConnectorArtifacts,
  connectorMarketplaceEntry,
  connectorAsImporter
} from './artifacts'
export type { ConnectorArtifacts, ConnectorToolDescriptor } from './artifacts'

export { evaluateConnectorInstall } from './install-gate'
export type { ConnectorInstallGate } from './install-gate'

export { wrapCliConnector } from './cli-wrap'
export type { WrapCliConnectorOptions } from './cli-wrap'

export {
  buildSlackConnector,
  SLACK_CONNECTOR_ID,
  CHANNEL_SCHEMA,
  CHAT_MESSAGE_SCHEMA
} from './slack-migration'
export type { SlackConnectorOptions } from './slack-migration'

// Integration connectors (exploration 0213)
export { buildRssConnector, parseFeed, RSS_CONNECTOR_ID, FEED_ITEM_SCHEMA } from './rss'
export type { RssConnectorOptions, FeedEntry } from './rss'
// Meeting detection from the calendar (exploration 0279)
export {
  buildGoogleCalendarConnector,
  detectUpcomingMeeting,
  attendeeNames,
  GOOGLE_CALENDAR_CONNECTOR_ID,
  MEETING_SCHEMA
} from './calendar'
export type { GoogleCalendarConnectorOptions, GoogleCalendarEvent } from './calendar'
export {
  buildGithubConnector,
  buildNotionConnector,
  buildAirtableConnector,
  buildLinearConnector,
  EXTERNAL_ITEM_SCHEMA,
  GITHUB_CONNECTOR_ID,
  NOTION_CONNECTOR_ID,
  AIRTABLE_CONNECTOR_ID,
  LINEAR_CONNECTOR_ID
} from './api-connectors'
export type {
  GithubConnectorOptions,
  NotionConnectorOptions,
  AirtableConnectorOptions,
  LinearConnectorOptions
} from './api-connectors'
