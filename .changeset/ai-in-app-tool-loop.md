---
'@xnetjs/plugins': minor
---

The in-app AI runtime can execute tools. `AiAgentRuntime` gains `tools`,
`executeTool`, `allowedTools` and `maxToolSteps`: when a model asks for a tool
the runtime runs it, feeds the result back as a `role: 'tool'` message, and
asks again, bounded by `maxToolSteps`. The allow-list is enforced in code — a
call outside it is refused before execution and reported back to the model —
and a throwing tool becomes an error message the model can recover from rather
than a failed turn. A new `tool.result` event carries each outcome.

Without an `executeTool` the runtime behaves exactly as before: tool calls are
recorded and never run.
