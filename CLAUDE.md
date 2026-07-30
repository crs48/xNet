@AGENTS.md

## Claude Code specifics

- Skills live in `.claude/skills/`; `.agents/skills` symlinks to it for Codex.
- Path-scoped elaborations go in `.claude/rules/` and must carry `paths:` —
  without it a rule loads every session, which is the cost this split removes.
- Nested `AGENTS.md` files are **not** re-injected after `/compact`. Anything
  that must hold for a whole session belongs in `AGENTS.md`, not a nested file.
