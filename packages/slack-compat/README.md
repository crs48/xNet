# @xnetjs/slack-compat

Slack wire-protocol compatibility primitives for xNet — the shared, pure-logic
core that lets integrations written against Slack work against xNet
(exploration [0198](../../docs/explorations/0198_%5B_%5D_SLACK_COMPATIBLE_INTEGRATIONS_AND_MIGRATION.md)).

> **Alpha software.** xNet is released but early: this package is on npm and
> usable today, but its API can change between releases, sometimes without a
> migration path. Pin your version. See the
> [project README](https://github.com/crs48/xNet#readme) for what alpha means here.

Zero runtime dependencies (`node:crypto` only). Used by the Slack **migration
connector** (`@xnetjs/plugins`) and the hub **`slack-compat` feature**
(`@xnetjs/hub`).

## What's here

| Export | Purpose |
| --- | --- |
| `slackMrkdwnToMarkdown(text)` | Translate Slack `mrkdwn` (`<url\|label>`, `<@U1>`, `*bold*`, escaped entities) → GitHub-flavored markdown. |
| `blockKitToMarkdown(blocks)` | Best-effort Block Kit (`header`/`section`/`context`/`divider`) → markdown. Interactive blocks degrade to their text. |
| `normalizeIncomingWebhook(payload)` | Collapse a Slack incoming-webhook body (blocks → attachments → text) into a transport-agnostic `{ content, channelHint?, username?, iconEmoji? }`. |
| `parseSlashCommand(body)` / `formatSlashResponse(opts)` | Slack-compatible slash-command request parsing + response formatting (defaults to `ephemeral`, matching Slack). |
| `verifySlackSignature(opts)` / `signSlackRequest(opts)` | `v0=HMAC_SHA256` signing-secret verification with replay protection. |

## Design notes

- **Lossy by design.** `ChatMessage.content` is GFM markdown; Slack messages are
  Block Kit JSON / legacy attachments. Translation is best-effort — buttons,
  selects, modals and App Home have no markdown equivalent and degrade to their
  text. Callers can park the original JSON in an `ext:` overlay for richer
  rendering later.
- **Pure + injectable.** No I/O, no globals, no clock except an injectable
  `nowSeconds` on signature verification — so every branch is unit-testable.

See the exploration for the full tiered-compatibility plan and what is
deliberately deferred (OAuth authorization server, bot identity, the full Events
API, interactive Block Kit).
