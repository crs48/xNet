---
'@xnetjs/devkit': minor
'@xnetjs/plugins': minor
'@xnetjs/cli': patch
---

Structured agent frames for the bridge (exploration 0392). The agent bridge can
now stream a turn as structured `AgentFrame`s — tool calls, tool results,
permission requests, cost, and session id — over a new framed endpoint
(`POST /v1/agent/stream`) instead of only text. `@xnetjs/devkit` exports the
`AgentFrame` vocabulary, `foldStreamJsonFrames`, and `streamTurnFrames` on the
Claude streaming agent; the existing OpenAI-compatible `/v1/chat/completions`
endpoint is unchanged. The bridge session map can now be made durable
(`fileSessionPersistence`) so `--resume` sessions survive a daemon restart, and
`xnet bridge serve --agent claude` wires this automatically.

`@xnetjs/plugins` adds a models.dev catalog consumer (`fetchModelsDevCatalog`,
with a vendored snapshot fallback for offline/outage) for cloud-key and local
model pickers, and now sends OpenRouter app-attribution headers
(`HTTP-Referer` / `X-Title`) on OpenRouter-bound requests.
