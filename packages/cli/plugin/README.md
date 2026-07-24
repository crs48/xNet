# xNet — Claude Code plugin

A first-party [Claude Code plugin](https://code.claude.com/docs/en/plugins)
that wires a coding agent to the user's xNet workspace (exploration 0393). It
bundles:

- **`skills/xnet/SKILL.md`** — the cross-harness agent skill (kept byte-identical
  to `xnet skill` by a CI guard, `plugin-skill-parity.test.ts`).
- **`.mcp.json`** — the `xnet` MCP server, registered **read-only** by default.

## Install

The one-step on-ramp writes the same files into your project (and can install
the skill user-wide):

```bash
xnet connect claude-code            # project scope, read-only
xnet connect claude-code --user     # also install the skill for all projects
xnet connect claude-code --writes   # register the MCP server with write access
```

Or point Claude Code at this directory as a plugin marketplace entry.

## Lanes

The primary lane is the **CLI** (`xnet search`/`query`/`checkout`/`commit`) —
token-cheap and grep-shaped. The bundled MCP server is the fallback for
shell-less clients. See `skills/xnet/SKILL.md` for the full workflow.
