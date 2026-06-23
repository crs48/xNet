/**
 * @xnetjs/plugins/actions — outbound Actions (exploration 0213).
 *
 * The reverse of a Connector: "when something happens in xNet, reach out." A
 * declared `network`/`secrets` surface, a `trigger`, and a guarded,
 * SSRF-checked `dispatch` — the Zapier/IFTTT half of the integration story.
 */

export { defineAction, shouldDispatch, ActionDefinitionError } from './define-action'
export type {
  ActionDefinition,
  DefinedAction,
  ActionTrigger,
  ActionEvent,
  ActionContext
} from './define-action'

export { runAction, guardedActionFetch, ActionDispatchError } from './runner'
export type { RunActionPorts } from './runner'

export { assertPublicUrl, ActionSsrfError } from './ssrf'

export {
  renderEvent,
  buildDiscordAction,
  buildSlackWebhookAction,
  buildTelegramAction,
  buildEmailAction,
  buildWebhookOutAction
} from './builtins'
export type { EmailActionOptions, WebhookOutOptions } from './builtins'
