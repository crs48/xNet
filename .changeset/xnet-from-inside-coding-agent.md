---
'@xnetjs/cli': minor
'@xnetjs/plugins': patch
---

Use xNet from inside a coding agent (exploration 0393). A new
`xnet connect claude-code|codex` command wires a coding agent to the workspace
in one idempotent step: it installs the agent skill, registers the `xnet` MCP
server (read-only by default, `--writes` to enable), writes a `CLAUDE.md`/
`AGENTS.md` contract, and can bootstrap a scoped vault checkout. It ships a
first-party Claude Code plugin (`packages/cli/plugin/`) whose bundled skill is
kept byte-identical to `xnet skill` by a CI guard.

The agent verbs (`checkout`/`status`/`commit`/`search`/`query`/`db`/`daemon`)
now resolve a backend automatically instead of hard-requiring the running app:
they probe the local API and otherwise fall back to a standalone SQLite store
via `--db`/`$XNET_DB` or a discovered data directory. New `--db`/`--agent`/
`--key` flags select the store and signing identity; local writes refuse a
silent ephemeral identity. `xnet doctor --agent-access` reports backend,
full-text search, and identity reachability, and `xnet mcp serve` gains a
`--read-only` mode (also `$XNET_READONLY=1`).

`@xnetjs/plugins` refreshes the agent `SKILL.md` with an explicit CLI-first lane
hierarchy, scoped-checkout guidance, and write-consent rules.
