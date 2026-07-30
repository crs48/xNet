# Migrating from Slack

xNet has a complete native chat substrate — channels, DMs, threads, mentions,
reactions, presence, an inbox — so a team can move off Slack and keep working.
This guide covers the two halves of that move and, crucially, **what does and
doesn't carry over automatically** ([exploration 0198](../explorations/0198_[_]_SLACK_COMPATIBLE_INTEGRATIONS_AND_MIGRATION.md)).

> **The honest promise.** Your incoming-webhook alerts and simple slash commands
> keep working with only a URL swap; your channels and history migrate in; and
> rich interactive apps (OAuth + Events API + Block Kit buttons/modals) need a
> first-class native connector rather than working unchanged. xNet is **not** a
> drop-in clone of the entire Slack app platform — and neither were Slack's
> open-source competitors, which emulated exactly these commodity tiers.

## Half 1 — Bring your data (the migration connector)

`@xnetjs/plugins` ships a **Slack migration connector** (`buildSlackConnector`,
id `dev.xnet.connector.slack`). It pulls your workspace's channels and message
history into xNet's native `Channel` and `ChatMessage` nodes via the **guarded
connector store** — egress is contained to `slack.com`, every node is stamped
into the target Space (no cross-space leakage), and writes are charged against
the dedicated `connector` budget surface. The Slack token lives in the **hub
broker** and never reaches the agent or the client.

```ts
import { buildSlackConnector } from '@xnetjs/plugins'

const slack = buildSlackConnector()
// slack.module     -> the installable, consent-gated FeatureModule
// slack.definition -> the connector (run server-side via runConnectorSync)
// slack.agentTools  -> add { search } to expose slack_search_messages to the agent
```

Message bodies are translated to GitHub-flavored markdown (Block Kit first, then
`mrkdwn`) so they render natively. **Deferred today:** export-`.zip` ingest,
DMs, files, reactions, and pagination — the connector currently pulls public/
private channels + their visible history via the Slack Web API.

## Half 2 — Keep your integrations working (the `slack-compat` hub feature)

`@xnetjs/hub` ships `slackCompatFeature()`, which speaks enough of Slack's wire
protocol that integrations point at xNet instead of Slack. It is **generic over
an injected delivery sink** — the hub does the Slack-specific verification and
parsing; your app wires the actual `ChatMessage` write (the same injection seam
the connectors and the GitHub→Tasks webhook use).

### Tier 0 — Incoming webhooks (the big, cheap win)

The most common Slack integration is a one-way alert ("post build failures to
#ops"). Point it at:

```
POST https://<your-hub>/slack/services/hooks/<token>
Content-Type: application/json

{ "text": "Build *failed*: <https://ci/42|logs>", "channel": "#ops" }
```

The token in the URL is the credential (as in Slack). `text`, Block Kit
`blocks`, and legacy `attachments` are all translated to markdown. **Only the
webhook URL changes** in the sending integration.

### Tier 1 — Slash commands

Point a Slack slash command's Request URL at `POST /slack/commands`. xNet
verifies the request with your **signing secret** (`x-slack-signature`,
replay-protected), parses the Slack-format form body, and returns a
Slack-shaped response (`response_type` defaults to `ephemeral`, matching Slack).
Set the signing secret on the hub:

```
SLACK_SIGNING_SECRET=…   # unset → /slack/commands answers 503
```

## Compatibility matrix

| Slack capability | xNet status | Notes |
| --- | --- | --- |
| **Incoming webhooks** (alerts) | ✅ Works (URL swap) | `text` / `blocks` / `attachments` → markdown. |
| **Slash commands** | ✅ Works (URL swap) | Signing-secret verified; `ephemeral`/`in_channel`. `response_url` delayed replies deferred. |
| **Channel + history migration** | ✅ Connector | Public/private channels + history. DMs/files/reactions/zip deferred. |
| **Web API posting** (`chat.postMessage` …) | 🔭 Planned (Tier 2) | Needs bot identity + bot tokens. |
| **Events API / Socket Mode** | 🔭 Planned (Tier 3) | Opt-in, best-effort. |
| **OAuth v2 app install** | 🔭 Planned (Tier 3) | No authorization server yet. |
| **Block Kit interactivity** (buttons, modals, App Home) | ⚠️ Degrades | Rendered to markdown; no interaction callbacks. Prefer a native connector. |

🔭 = designed in the exploration, not yet built. ⚠️ = best-effort, lossy.

## When to reach for a native connector instead

For a rich app (PagerDuty, Datadog, GitHub, Jira), don't chase Slack-API parity
— write an xNet-native **connector** with `agentTools`. It's governed, the
credential stays in the hub, and the agent operates on policy-evaluated nodes
rather than a raw Slack emulation. That's the destination; the compat shim is
the on-ramp.

## What's deferred (and why)

The OAuth authorization server, the bot/app identity (a synthetic DID + actor),
the full Events API emitter, and interactive Block Kit are **security-sensitive
subsystems** the exploration deliberately sequences after the commodity tiers.
See [exploration 0198](../explorations/0198_[_]_SLACK_COMPATIBLE_INTEGRATIONS_AND_MIGRATION.md)
for the full plan and rationale.
