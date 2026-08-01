# Driving xNet from OpenClaw, Hermes, Buzz (and other MCP agents)

xNet exposes its workspace as an **MCP substrate**: any MCP client — OpenClaw,
Hermes Agent, Claude Code, Codex, Cline, Goose — can read and safely mutate
your tasks, pages, and databases through one server. You build the connection
once; it works for every client
([exploration 0175](../explorations/0175_[_]_XNET_AS_A_SUBSTRATE_FOR_OPENCLAW.md)).

Every write flows through xNet's mutation-plan guardrail (risk, scopes,
approval, audit, rollback) regardless of which client is connected — so letting
an autonomous agent into your workspace is governed by xNet, not by the agent's
own (often weak) safety model.

With an **Agent Passport** (below), the agent additionally gets its own DID and
a scoped, operator-delegated UCAN — every change it makes is signed by *its*
identity, every tool call lands as a signed `AgentAction` audit node, and
risky calls go through a risk-tiered approval ceremony
([exploration 0337](../explorations/0337_[x]_OPENCLAW_HERMES_INTEGRATION_SIGNED_AGENT_AUDIT_TRAILS_AND_TEXT_CONTROL_PLANE.md)).

## Start the server

xNet talks to its local API, so start that first (the desktop/CLI app exposes
it on `http://127.0.0.1:31415` by default), then:

```bash
# stdio — for clients that spawn the server (Claude Code, Codex, OpenClaw stdio)
xnet mcp serve

# hardened loopback HTTP — for browser / HTTP-only clients (OpenClaw streamable-http)
xnet mcp serve --http --allow-origin https://your-app.example --port 31416
```

The `--http` form prints the bound URL, a generated **pairing token**, and a
ready-to-paste OpenClaw config block.

## Configure OpenClaw

Add an entry to OpenClaw's `mcp.servers`. stdio is simplest and most secure
(process isolation, no network surface):

```jsonc
{
  "mcp": {
    "servers": {
      "xnet": {
        "command": "xnet",
        "args": ["mcp", "serve"],
        "transport": "stdio",
        // Least privilege: expose reads + safe writes, withhold destructive tools.
        "toolFilter": { "include": ["xnet_*"], "exclude": ["xnet_delete"] }
      }
    }
  }
}
```

For the HTTP transport (e.g. an Electron-hosted xNet), use the snippet printed by
`xnet mcp serve --http`:

```jsonc
{
  "mcp": {
    "servers": {
      "xnet": {
        "url": "http://127.0.0.1:31416/mcp",
        "transport": "streamable-http",
        "headers": { "x-xnet-pairing": "<token printed by the server>" }
      }
    }
  }
}
```

## Enroll the agent (Agent Passport)

Give the agent its own scoped identity instead of yours:

```bash
# Mint a did:key for the agent + a 7-day operator-signed UCAN limited to
# node/create + node/update in the named Space(s). Saved to
# ~/.xnet/agents/homeclaw.json (0600) — the key never reaches the gateway.
xnet agent enroll homeclaw --runtime openclaw --space <spaceId> \
  --key $XNET_SIGNING_KEY

# Serve as that agent. With --db, writes are signed by the AGENT's DID in a
# local store — the change log becomes its tamper-evident audit trail.
xnet mcp serve --agent homeclaw --db ~/.xnet/homeclaw.sqlite \
  --audit-space <spaceId>
```

`enroll` prints ready-to-paste config for both OpenClaw (`mcp.servers`) and
Hermes Agent (`mcpServers`) — the `--agent` serve command is the same.

What this buys you:

- **Attribution** — `AgentAction` nodes record every tool call (tool, verbatim
  instruction, risk, status, reversibility, produced change ids). Browse them
  in the DevTools **Agent Audit** panel, filtered per agent.
- **Risk-tiered approvals** — low-risk calls run; medium-risk calls park
  behind a one-time `APPROVE <code>` you type in chat (5-minute TTL);
  high/critical calls can **only** be approved in an xNet surface — the agent
  relaying your chat cannot forge those.
- **Scoped authority** — the delegated UCAN names spaces and actions;
  wildcards are rejected at mint time. Hubs with `trustedDids` configured
  reject any token that doesn't chain to your operator DID.
- **Undo** — `xnet_undo <actionId>` rolls back reversible actions.
- **A text outbox** — `AgentNotification` nodes are polled by the agent
  (`xnet_poll_notifications`) and relayed to you over WhatsApp/Telegram/…, so
  the hub reaches you through channels the agent already has.

Rotate by re-running `enroll` (passports expire after 7 days by default).

## Hermes Agent

Hermes consumes the same MCP server and the same AgentSkills-format skill.
Use the `mcpServers` snippet printed by `enroll` (or configure
`xnet mcp serve --agent <name>` as a stdio server in Hermes's config). The
ceremony, audit trail, and outbox behave identically. One caution specific to
Hermes: its learning loop autonomously writes new skill documents — the audit
trail is how you retrace *which* self-written skill drove an action, so keep
enrolled mode on.

## Buzz (agents that already have a key)

Block's [Buzz](https://github.com/block/buzz) gives every agent its own Nostr
keypair, so a Buzz agent arrives already carrying a credential worth believing.
xNet accepts it as **evidence of identity only** — the `npub` proves *who*, and
your UCAN still decides *what*:

```ts
import { enrollBuzzAgent } from '@xnetjs/comms'

const enrollment = enrollBuzzAgent({
  npub: 'npub1…',                      // the agent's Buzz identity
  proof,                                // signed Nostr event (kind 27235)
  challenge,                            // YOUR single-use challenge bytes
  operatorDID,
  operatorKey,
  capabilities: [{ with: 'xnet://space/inbox', can: 'node/create' }]
})
```

The proof must sign the exact challenge you issued — a replayed signature over
an older challenge is refused, as is a proof signed by any key other than the
one the `npub` encodes. On success you get a normal Agent Passport: a **fresh**
xNet `did:key`, scoped by your capabilities. The Nostr key never becomes an
xNet signing key.

`connectBuzzRelay()` then routes that agent's tool calls through the same
guardrail everything else goes through — Buzz's own team access controls are
host configuration, and xNet never honours them in place of its own.

> **Why not just trust Buzz's permissions?** Because xNet's signature would
> then attest to a decision xNet never verified. See ADR-29.

## Verifying what an agent did

Every enrolled agent's actions export as a self-contained receipt that anyone
can check **offline** — no hub, no account, no network:

```bash
xnet audit verify ./agent-audit.json
```

It checks four independent things, and fails loudly on any of them:

1. the passport verifies and names your operator DID as issuer;
2. every change hash-verifies and signature-verifies under the *agent's* DID;
3. the per-author chain is unbroken (this is what catches a **removed**
   action — a per-change check alone cannot);
4. every high/critical action carries an approval signed by **you**, not the
   agent.

Export is free and always will be (`docs/CHARTER.md` §6).

## Revoking a passport early

Expiry is the backstop, not the only lever:

```ts
import { revokeAgentPassport, verifyAgentPassport } from '@xnetjs/identity'
import { RevocationStore } from '@xnetjs/identity'

store.revoke(revokeAgentPassport(operatorDID, operatorKey, passportUcan))
verifyAgentPassport(passportUcan, { revocations: store }) // → { valid: false }
```

Only the operator that issued the delegation can sign the revocation. A
verifier that is never given the denylist still honours the passport until it
expires, so keep TTLs short regardless.

## Hardening OpenClaw

OpenClaw's defaults are permissive and it has a documented history of security
issues (a critical RCE, sandbox bypasses, prompt-injection exposure). Treat the
agent as untrusted and harden its host:

- **Don't bind it to the network.** Keep its gateway on loopback; never expose
  `0.0.0.0:18789`.
- **Run it sandboxed** (Docker), with least-privilege filesystem access:
  ```bash
  docker run -d --name openclaw --user openclaw --read-only --tmpfs /tmp \
    --cap-drop=ALL --security-opt=no-new-privileges -p 127.0.0.1:18789:18789 ...
  ```
- **Scope what xNet exposes** with `toolFilter` — exclude `xnet_delete` and any
  outward-facing tools unless you need them.
- **Keep the guardrail on.** xNet requires approval for medium+ risk and
  destructive/outward actions; never run a flow that bypasses it.
- **Vet skills.** ClawHub has had malicious skills; pin and review anything you
  install, including xNet's own ([skill](../integrations/openclaw/xnet-workspace-skill.md)).

## Why route through OpenClaw vs. Claude Code / Codex directly?

Choose **OpenClaw** for *ambient reach* — driving your workspace from WhatsApp /
Telegram / iMessage, on a schedule, with a local model. Choose **Claude Code /
Codex** for coding-grade capability, lower setup friction, and stronger
security. Because all of them speak MCP to the same xNet server, you pick per
use-case and xNet doesn't have to.

## See also

- [ClawHub skill](../integrations/openclaw/xnet-workspace-skill.md)
- [Connect a model](./connect-a-model.md)
- [xNet-as-substrate exploration](../explorations/0175_[_]_XNET_AS_A_SUBSTRATE_FOR_OPENCLAW.md)
- [Agent harness or agent substrate (0416)](../explorations/0416_[-]_AGENT_HARNESS_OR_AGENT_SUBSTRATE.md)
  — why xNet is not a competing harness (ADR-29)
