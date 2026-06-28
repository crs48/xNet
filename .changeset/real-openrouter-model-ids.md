---
'@xnetjs/entitlements': patch
---

Fix the managed-AI plan model IDs to match OpenRouter's catalog: the Anthropic
models use a dotted version (`anthropic/claude-haiku-4.5`,
`anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.8`), not a dashed one.
The previous dashed IDs (`…-4-5` / `…-4-6` / `…-4-8`) don't exist upstream, so a
tenant on a default Anthropic model got a model-not-found error. The OpenAI and
Google IDs were already correct.
