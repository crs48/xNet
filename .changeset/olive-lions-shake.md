---
'@xnetjs/plugins': minor
---

Parked agent approvals are now reachable by the host.

`AgentAuditRecorder` decides whether a call needs a human but does not hold the
call open while one is found, and `approveFromApp` had no caller outside the
in-app AI panel. A high or critical action from any other surface — a bridged
coding agent, an MCP client — therefore parked where nothing could release it
and expired silently.

- New `createApprovalBroker(recorder, options)` (exported from the root barrel):
  headless park/settle over a recorder, with a change subscription. `maxWaitMs`
  bounds how long a caller waits without un-parking the action, so a transport
  timeout never looks like a decision.
- `MCPServer` configured with `agentAudit` now **parks** medium+ risk tool
  calls instead of returning a pending payload, so an approval resumes the
  agent's turn with the real result. New `listParkedApprovals()`,
  `onParkedApprovalsChanged()`, `approveParkedApproval(actionId, approverDID)`
  and `denyParkedApproval(actionId)` give the host the release path that
  high/critical actions require by design.
- `agentAudit` accepts `approvalWaitMs` (default 55s) alongside `approvalTtlMs`.
- `createAgentCeremonyTools(recorder, broker?)` takes the broker so a relayed
  `APPROVE <code>` settles the parked call rather than applying the action
  beside a caller still waiting.

Behaviour change for embedders: with `agentAudit` configured, a medium+ risk
`tools/call` no longer resolves immediately with `{ pending: true }`. It
resolves when the operator decides, or — after `approvalWaitMs` — with a
still-pending payload that leaves the action parked.
