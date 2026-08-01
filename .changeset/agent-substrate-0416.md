---
'@xnetjs/identity': minor
'@xnetjs/data': minor
'@xnetjs/plugins': minor
'@xnetjs/devkit': minor
'@xnetjs/cli': minor
---

Agent accountability substrate and JSON-RPC agent adapters (exploration 0416).

**`@xnetjs/identity`** — `enrollForeignAgent()` mints a scoped Agent Passport
from a verified foreign credential (a Buzz `npub`, an A2A agent card), with the
proof verifier injected so no ecosystem-specific dependency enters the package.
Passport revocation is no longer expiry-only: `revokeAgentPassport()` signs a
denylist entry and `verifyAgentPassport()` consults one via the new
`revocations` option.

**`@xnetjs/data`** — new `@xnetjs/data/agent-audit` sub-entry: build, serialize
and **offline-verify** an `AgentAuditBundle`. `verifyAgentAudit()` checks the
passport, every change's hash and signature, the unbroken per-author chain (which
is what catches a *removed* action), and that every high/critical action carries
an operator-signed approval.

**`@xnetjs/plugins`** — a per-session egress budget (`EgressMeter`) meters agent
reads and raises a typed `EgressBudgetError` rather than returning a silently
truncated result. The model lane now emits the same `AiAgentFrame` vocabulary the
bridge lane speaks, via the new `onFrame` runtime option.

**`@xnetjs/devkit`** — `codexAppServerChatAgent()` and `acpChatAgent()` drive
Codex `app-server` and any ACP agent over a new JSON-RPC-over-stdio transport
(`JsonRpcSession`, `NodeDuplexRunner`), so conversations resume on a thread
instead of replaying history. `createPermissionBroker()` plus
`POST /v1/agent/permission` give the bridge a real answer channel, so a
permission request can be approved in-app instead of only displayed.

**`@xnetjs/cli`** — `xnet audit verify <bundle>` verifies an exported audit
bundle offline and exits non-zero on any problem.

All additions are additive; no existing export changed shape.
