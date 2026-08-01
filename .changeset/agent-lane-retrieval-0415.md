---
'@xnetjs/plugins': major
'@xnetjs/data': minor
'@xnetjs/cli': major
---

Coding agents now get xNet's real retrieval, and a search that admits when it
couldn't do its job.

Every agent lane — the `xnet` CLI, `xnet mcp serve`, and the bridged agent
inside the desktop app — previously built its AI surface with no retriever and
fell back to a substring scan over the first 500 nodes, then rendered that
result identically to an exhaustive search. All three now go through one
`createAgentRetrieval()` construction path (enforced by a build guard), and
`xnet search` leads with the tier it actually ran at, warning on stderr when it
degraded.

New: `xnet recall` and the `xnet_recall` MCP tool return a budgeted context pack
where each hit carries the graph path it was reached by; `xnet serve` keeps the
read path warm behind a unix socket; `xnet remember` / `forget` / `memories` /
`distill` give the agent memory across sessions; and `api.recall` / `api.graph`
let a sandboxed `xnet run` script reach past its loaded slice.

**Breaking (`@xnetjs/plugins`)**: `AgentApi` gains required `recall` and `graph`
methods and `AgentScriptSession` gains `getRequestedContext()` — implementors of
those interfaces must update. `MCP_CORE_TOOL_NAMES` gains `xnet_recall`, and
`XNET_AGENT_SKILL_MD` has been rewritten.

**Breaking (`@xnetjs/cli`)**: `AgentCliServices` gains a required `retrieval`
field, and `runSearch` output now begins with a `tier` provenance line — anything
parsing its first line as the column header must skip it.
