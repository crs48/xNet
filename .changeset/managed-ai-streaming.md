---
'@xnetjs/plugins': minor
---

The managed XNet Cloud AI provider (`ManagedProvider`) now supports **streaming**.
It implements `stream()` over the new `/ai/chat/stream` SSE endpoint — yielding
text deltas as they arrive and reporting the live budget from the terminal event —
and its capabilities now advertise `streaming: true`. A pre-stream `402` or an
`ai_budget_exceeded` event surfaces as a typed `AiBudgetError`, same as the unary
path. Non-streaming callers are unaffected.
