# Connect a model

xNet's AI features are **bring-your-own-model**: the app never hosts a model or
pays for tokens. Instead it connects to compute you already have. There is no
single transport that works in every browser, so xNet probes a tiered set of
**connectors** and prefers the most capable one available
([exploration 0174](../explorations/0174_[_]_BRING_YOUR_OWN_MODEL_AI_CHAT_PANEL.md)).

Detection is implemented in `@xnetjs/plugins` (`detectConnectors()` /
`pickBestConnector()`); this guide is the user-facing companion.

## The tiers

| Tier | What it is | Install | Works in Safari | Cost to you | Tool calling |
| --- | --- | --- | --- | --- | --- |
| **Cloud key** | Your Anthropic / OpenAI / OpenRouter API key | paste a key | ✅ | metered (your key) | best |
| **Local server** | Ollama / LM Studio on your machine | model app | ❌ (mixed content) | free | good |
| **In-browser (WebLLM)** | a small model running in the tab via WebGPU | none | ✅ (Safari 26+) | free | weak |
| **Chrome built-in** | Gemini Nano via the Prompt API | none | ❌ (Chrome only) | free | none yet |
| **Local bridge** | a daemon driving your Claude Code / Codex subscription | daemon / Electron | ❌ in web (✅ Electron) | your subscription | best |

xNet prefers them in capability order: **bridge → cloud key → local server →
WebLLM → Chrome built-in**. When the active model can't reliably call tools,
xNet downgrades writes to **propose-only** (the agent drafts a change you
approve) instead of applying them autonomously.

## Cloud key (works everywhere)

The reliable default. Paste an API key in settings; it is stored locally and is
**never sent to the xNet hub**. Use [OpenRouter](https://openrouter.ai) if you
want one key for many models.

## Local server — Ollama / LM Studio

Free and private, but a browser served over HTTPS (e.g. GitHub Pages) faces two
gates:

1. **CORS** — the server must allow the app's origin:
   - **Ollama**: set `OLLAMA_ORIGINS` to include the app origin (or `*`) and
     restart the service. On macOS: `launchctl setenv OLLAMA_ORIGINS "*"` then
     restart Ollama; on Linux add `Environment=OLLAMA_ORIGINS=*` to the systemd
     unit.
   - **LM Studio**: flip the **CORS** toggle in the Local Server tab (no
     terminal needed — the easier option).
2. **Chrome Local Network Access** — Chrome 142+ shows a one-time prompt to let
   a public site reach a loopback address. Click **Allow**.

> **Safari** blocks HTTPS→localhost entirely (a long-standing WebKit
> limitation), so this tier does not work in web Safari. Use the cloud-key or
> in-browser tier there, or run the Electron app.

If detection fails, xNet surfaces the specific reason (CORS vs. unreachable) and
the fix.

## In-browser (WebLLM)

Zero install: a small model (≈0.9–3.7 GB) downloads on first use and runs in the
tab via WebGPU. Works offline and in Safari 26+. Best for chat and retrieval;
because in-tab tool calling is unreliable, workspace edits run in
**propose-only** mode.

## Chrome built-in AI (Gemini Nano)

If you're on a recent Chrome with the on-device model downloaded, xNet can use
the built-in `LanguageModel` API — no key, no install. It has no tool calling
yet, so it's chat/summarize only.

## Local bridge (use your Claude Code / Codex subscription)

The daily-driver tier
([exploration 0391](../explorations/0391_[_]_XNET_AS_THE_DAILY_DRIVER_AI_INTERFACE.md)):
a small local daemon exposes a loopback endpoint to the app and drives the
official `claude` / `codex` CLI, so requests ride the subscription you already
pay for. The daemon **spawns the official CLI** (which holds its own auth) — xNet
never handles your tokens.

```sh
xnet bridge serve                      # one-off; prints a pairing code
xnet bridge install                    # macOS: start at login, stable pairing code
xnet bridge serve --allow-origin https://app.xnet.fyi   # for the deployed app
```

Paste the pairing code into the AI panel ("Local bridge" tier) once. With
Claude Code the bridge streams tokens live and carries the conversation across
turns (`--resume`), so long research threads don't re-send their history.

- **Workspace tools** are on by default in **read-only** mode — the agent can
  search and read your workspace but not change it. Consent to writes
  explicitly with `--allow-writes` (creates/updates then flow through the AI
  surface's audited write path).
- **Chrome Local Network Access** — Chrome 142+ shows a one-time prompt before
  an HTTPS page may reach a loopback daemon. Click **Allow**; declining leaves
  the bridge tier unavailable until you re-allow it in site settings.
- **Safari** blocks HTTPS→localhost entirely (the same WebKit limitation as
  the local-server tier): use Chrome/Edge for the web app, or the Electron
  app, where the daemon is built in and pairs automatically.
- A future browser-extension transport (`packages/native-bridge-extension`,
  exploration 0289 Option C) removes the loopback port entirely; it stays a
  spike until the daemon path has proven itself as the daily driver.

> Subscription-automation terms change; the bridge only ever spawns your own
> installed, already-authenticated CLI on your own machine — never embedded
> logins, never your tokens. Verify your provider's current terms.

## OpenRouter connect (no daemon, your own account)

If you can't run a daemon (another machine, a tablet), the cloud-key tier's
**Connect OpenRouter account** button runs OpenRouter's PKCE flow: authorize on
openrouter.ai and xNet receives a key scoped to **your** OpenRouter account and
balance — no key copy-paste, and xNet is never in the billing path.

## See also

- [OpenClaw integration](./openclaw-integration.md) — drive your xNet workspace
  from an agent over MCP.
- [Bring-Your-Own-Model exploration](../explorations/0174_[_]_BRING_YOUR_OWN_MODEL_AI_CHAT_PANEL.md).
