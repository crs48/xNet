# @xnetjs/cli

Connect a coding agent to an xNet workspace — and work with that workspace
from the terminal: checkout, query, commit, search, MCP.

> **Alpha software.** xNet is released but early: this package is on npm and
> usable today, but its API can change between releases, sometimes without a
> migration path. Pin your version. See the
> [project README](https://github.com/crs48/xNet#readme) for what alpha means here.

## Connect your agent (the one-liner)

```bash
npx @xnetjs/cli connect claude-code   # or: connect codex
```

One idempotent command: installs a ~500-token `SKILL.md`, registers the xNet
MCP server (**read-only** by default; `--writes` to opt in), writes a fenced
section into `CLAUDE.md`/`AGENTS.md` without touching the rest of the file,
and self-checks with `xnet doctor --agent-access`. The registered server
launches as `xnet` when the bin is on your PATH, or as `npx -y @xnetjs/cli`
after a zero-install connect — it keeps working either way.

Claude Code or Codex can then read, search, query, and edit your pages,
databases, and canvases — whether or not the desktop app is running (it finds
the app's local API, or a standalone SQLite store via `--db`/`$XNET_DB`).

Full guide: [Connect Your Agent](https://xnet.fyi/docs/guides/coding-agents/) ·
[Agent Interfaces](https://xnet.fyi/docs/guides/agent-interfaces/) (the three
lanes, checkout layout, and the token benchmark).

## The agent lanes, cheapest first

```bash
xnet search "q3 roadmap"                       # ranked full-text hits (TSV)
xnet query tasks --where status=open           # query a database
xnet checkout --query "roadmap" --dir ./vault  # a scoped slice as Markdown/JSONL
xnet status                                    # pending plans and conflicts
xnet commit --apply                            # file edits -> validated mutations
xnet mcp serve                                 # slim MCP server (no-shell fallback)
```

Edits never write to the store directly: they become schema-validated
mutation plans, and stale or malformed edits quarantine as conflict notes
instead of silently overwriting newer data. Writes are signed — by a key you
provide or an enrolled agent passport (`xnet enroll`); the CLI refuses to
write under a throwaway identity.

## Installation

```bash
npm install -g @xnetjs/cli    # global `xnet` bin
# or run everything through npx @xnetjs/cli without installing
```

## All commands

- `connect` — wire a coding agent (claude-code | codex) to this workspace
- `checkout` / `status` / `commit` — the vault: scoped file working tree
- `search` / `query` / `db` — token-cheap reads and writes, plain stdout
- `run` — sandboxed bulk scripts with write *proposals*
- `mcp` — serve the slim MCP fallback (stdio or `--http`)
- `doctor` — integrity checks, `--agent-access` self-check
- `enroll` — agent passports for signed writes
- `migrate` — analyze schema deltas, generate lens code, run migrations
- `schema` — extract schemas and diff snapshots for CI gates

Run `xnet --help` (or `npx @xnetjs/cli --help`) for the full tree.
