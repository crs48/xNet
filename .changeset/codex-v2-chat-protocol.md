---
'@xnetjs/devkit': minor
---

Use Codex's current app-server protocol for initialization, persistent thread resume,
streamed answers, approvals, and terminal errors. Callers can cancel a turn with an
AbortSignal and request a structured response. A disconnected process no longer
reports a partial answer as successful. Provider environment, model, instructions,
and configuration can be supplied explicitly by the embedding application.
