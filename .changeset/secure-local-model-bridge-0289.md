---
'@xnetjs/devkit': major
'@xnetjs/plugins': minor
'@xnetjs/cli': minor
---

Secure the browser↔local-model bridge (exploration 0289).

- **`@xnetjs/devkit` (breaking):** the agent bridge daemon now **requires a
  per-launch pairing token** (`Authorization: Bearer <token>`, constant-time
  compared) on its data endpoints (`/v1/chat/completions`, `/run`) and validates
  the `Host` header to reject DNS-rebinding requests. `BridgeServerConfig` gains
  `pairingToken?`, `BridgeServerHandle` exposes `pairingToken`, and a token is
  auto-generated when none is supplied — so a client that previously called the
  data endpoints with no auth now gets `401`. `/health` stays unauthenticated so
  detection still works before pairing. New `openAiChatAgent` lets the bridge
  front a raw OpenAI-compatible model server (Ollama/LM Studio) through the same
  authenticated door.
- **`@xnetjs/plugins`:** `ConnectorEnv` gains `appOrigin` and the local-server
  setup hint now names the exact `OLLAMA_ORIGINS=<origin>` line (never a
  wildcard); new `localServerSetupHint` export; the MCP HTTP transport now
  validates the `Host` header (defense-in-depth, no change for legitimate
  callers). Additive.
- **`@xnetjs/cli`:** `xnet bridge serve` prints the pairing code and gains
  `--token` (pin the code) and `--upstream` / `--upstream-model` (front a raw
  local model). Additive.
