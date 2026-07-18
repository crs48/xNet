---
'@xnetjs/data': minor
'@xnetjs/identity': minor
'@xnetjs/plugins': minor
'@xnetjs/cli': minor
---

Agent Passports and signed agent audit trails (exploration 0337).

- `@xnetjs/data`: new agent schema pack — `AgentPassport`, `AgentSession`,
  `AgentAction`, `AgentApproval`, `AgentNotification` — with deterministic id
  helpers (`agentActionId`, …) and `redactInstruction`.
- `@xnetjs/identity`: `mintAgentPassport` / `verifyAgentPassport` (per-agent
  `did:key` + operator-delegated, attenuation-checked UCAN; wildcards
  rejected) and `rootIssuers` for delegation-chain root inspection.
- `@xnetjs/plugins`: `AgentAuditRecorder` wraps the AI surface so every tool
  call lands as an `AgentAction` node and medium+ risk calls park behind a
  risk-tiered approval ceremony (chat nonce with TTL for medium; xNet-surface
  only for high/critical); ceremony tools (`xnet_approve`, `xnet_deny`,
  `xnet_pending_approvals`, `xnet_undo`) and the `xnet_poll_notifications`
  outbox tool; `MCPServerConfig.agentAudit` wires it into the MCP server;
  `NodeStoreAPI.create` now accepts an optional deterministic `id`; new AI
  scopes `agent.approve` and `agent.notifications`.
- `@xnetjs/cli`: `xnet agent enroll <name>` mints and stores passports
  (`~/.xnet/agents`, 0600) and prints OpenClaw/Hermes config; `xnet mcp serve
  --agent <name> [--db <path>]` serves an agent-scoped session over an
  agent-signed local store.
