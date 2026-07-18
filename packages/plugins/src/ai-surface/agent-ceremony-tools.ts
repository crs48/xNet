/**
 * Agent-facing ceremony + notification tools (exploration 0337).
 *
 * These are `AiExtraTool`s the MCP server exposes to an enrolled agent
 * (OpenClaw, Hermes, …):
 *
 *   - `xnet_approve` — redeem an operator-typed `APPROVE <code>` from chat.
 *     Only medium-risk (chat-tier) actions carry a code; high/critical
 *     actions have none, so this tool mechanically cannot release them.
 *   - `xnet_deny` / `xnet_pending_approvals` — ceremony bookkeeping.
 *   - `xnet_undo` — roll back a reversible applied action.
 *   - `xnet_poll_notifications` — drain the hub→operator outbox
 *     (`AgentNotification` nodes) so the agent can relay them over its
 *     messaging channels. No new transport: the outbox is just nodes.
 */

import type { NodeStoreAPI } from '../services/local-api'
import type { AgentAuditRecorder } from './agent-audit'
import type { AiExtraTool } from './types'
import { AGENT_NOTIFICATION_SCHEMA_IRI } from '@xnetjs/data'
import { readOptionalNumber, readOptionalString, readRequiredString } from './args'

export function createAgentCeremonyTools(recorder: AgentAuditRecorder): AiExtraTool[] {
  return [
    {
      name: 'xnet_approve',
      title: 'Redeem a chat approval code',
      description:
        'Redeem an APPROVE code the operator typed in chat to release a pending medium-risk action. High/critical actions carry no code and can only be approved in the xNet app.',
      risk: 'low',
      requiredScopes: ['agent.approve'],
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code the operator replied with' },
          peer: { type: 'string', description: 'Channel peer id that replied (forensics)' }
        },
        required: ['code']
      },
      invoke: async (args) => {
        const code = readRequiredString(args, 'code')
        const peer = readOptionalString(args, 'peer')
        return await recorder.approveFromChat(code, peer)
      }
    },
    {
      name: 'xnet_deny',
      title: 'Deny a pending action',
      description: 'Deny a pending agent action; records the denial in the audit trail.',
      risk: 'low',
      requiredScopes: ['agent.approve'],
      inputSchema: {
        type: 'object',
        properties: {
          actionId: { type: 'string', description: 'The pending AgentAction node id' }
        },
        required: ['actionId']
      },
      invoke: async (args) => {
        await recorder.deny(readRequiredString(args, 'actionId'))
        return { denied: true }
      }
    },
    {
      name: 'xnet_pending_approvals',
      title: 'List pending approvals',
      description:
        'List actions waiting on operator approval (never includes approval codes).',
      risk: 'low',
      requiredScopes: ['agent.approve'],
      inputSchema: { type: 'object', properties: {} },
      invoke: async () => ({ pending: recorder.listPending() })
    },
    {
      name: 'xnet_undo',
      title: 'Undo a reversible agent action',
      description:
        'Roll back an applied action whose reversibility is `reversible`. Compensatable and irreversible actions are refused with a reason.',
      risk: 'medium',
      requiredScopes: ['agent.approve'],
      inputSchema: {
        type: 'object',
        properties: {
          actionId: { type: 'string', description: 'The applied AgentAction node id' }
        },
        required: ['actionId']
      },
      invoke: async (args) => await recorder.undo(readRequiredString(args, 'actionId'))
    }
  ]
}

export type AgentNotificationToolsOptions = {
  /** Poll page cap (default 20). */
  maxBatch?: number
}

export function createAgentNotificationTools(
  store: NodeStoreAPI,
  options: AgentNotificationToolsOptions = {}
): AiExtraTool[] {
  const maxBatch = options.maxBatch ?? 20
  return [
    {
      name: 'xnet_poll_notifications',
      title: 'Poll the operator notification outbox',
      description:
        'List pending AgentNotification nodes (hub→operator outbox). Pass markDelivered to acknowledge them after relaying to the operator.',
      risk: 'low',
      requiredScopes: ['agent.notifications'],
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: `Max entries (default ${maxBatch})` },
          markDelivered: {
            type: 'boolean',
            description: 'Mark returned notifications as delivered'
          }
        }
      },
      invoke: async (args) => {
        const limit = Math.min(readOptionalNumber(args, 'limit') ?? maxBatch, 100)
        const nodes = await store.list({
          schemaId: AGENT_NOTIFICATION_SCHEMA_IRI,
          limit: 500
        })
        const pending = nodes
          .filter((n) => !n.deleted && n.properties.status === 'pending')
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(0, limit)
        if (args.markDelivered === true) {
          for (const node of pending) {
            await store.update(node.id, { properties: { status: 'delivered' } })
          }
        }
        return {
          notifications: pending.map((n) => ({
            id: n.id,
            kind: n.properties.kind,
            title: n.properties.title,
            body: n.properties.body,
            action: n.properties.action,
            createdAt: n.createdAt
          }))
        }
      }
    }
  ]
}
