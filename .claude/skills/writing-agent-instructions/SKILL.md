---
name: writing-agent-instructions
description: >-
  How to write and edit xNet's agent instructions — the root AGENTS.md, nested
  surface files, and SKILL.md frontmatter. Use when editing any AGENTS.md or
  CLAUDE.md, authoring a skill, or deciding where a new rule belongs.
license: MIT
compatibility: Requires the repo checkout
allowed-tools: Read Bash(node:*) Bash(pnpm:*)
metadata:
  source: https://github.com/BuilderIO/agent-native/blob/main/.agents/skills/writing-agent-instructions/SKILL.md
  local-changes: >-
    Rewritten for xNet's instruction tree (0405); the defineAction, template and
    workspace-sync sections were dropped.
---

# Writing agent instructions

## Where a rule goes — decide by when it loads

| Mechanism                                  | Loads                                        | Owns                                      |
| ------------------------------------------ | -------------------------------------------- | ----------------------------------------- |
| Root `AGENTS.md`                           | Every session, in full                       | Invariants, orientation, the skills index |
| `apps/<x>/AGENTS.md`, `packages/AGENTS.md` | On demand — when an agent reads a file there | Surface conventions                       |
| `.claude/rules/*.md` **with** `paths:`     | When a matching file is read                 | Claude-only path rules                    |
| `.claude/skills/*/SKILL.md`                | When the description matches the task        | Multi-step workflows                      |

Ask two questions: **must every client obey it?** (if no, a rule file is
allowed; if yes, it belongs in an `AGENTS.md` — Codex and Copilot never read
`.claude/rules/`). And **does it apply every session?** (if no, push it down to
the surface that owns it).

> A `.claude/rules/*.md` **without** `paths:` loads at launch with the same cost
> as the root file. Splitting a big file into rule files with no `paths:` buys
> nothing and adds places to drift. `pnpm check:agent-docs` fails on it.

## One source, always

`CLAUDE.md` is `@AGENTS.md` plus at most a short Claude-only block. Never put
content above the import, and never restate an `AGENTS.md` rule in a
`CLAUDE.md`. The brand-spelling rule was once written out twice in two wordings,
with one copy already deferring to the other — that is the failure this shape
prevents, and the guard now enforces it.

## Size

Target **under 200 lines** for the root file; longer files measurably reduce
adherence. Cut anything an agent can derive from the codebase — directory
listings, dependency inventories, restated `package.json` scripts. Keep
pitfalls, rationale, and conventions that differ from tool defaults.

`@`-imports do not save context: imported files are expanded at launch. Only
path-scoped rules and nested files defer cost.

Block-level HTML comments are stripped before injection — use them for
maintainer notes that should not cost tokens.

## Nested files and `/compact`

The root file is re-read and re-injected after `/compact`. **Nested files are
not** — they reload only when an agent next reads a file in that directory. So
anything that must hold for a whole session (security invariants, destructive
operations) belongs at the root. Nested files carry conventions, not guardrails.

## SKILL.md frontmatter

`name` (≤64 chars, lowercase, hyphens, matching the directory) and `description`
(≤1024 chars) are required. The description is the only thing an agent sees when
deciding whether to load the skill, so it must say **what it does AND when to
use it** — lead with the capability, then an explicit "Use when…".

Optional and worth using: `license`, `compatibility`, `metadata` (put `source`
and `local-changes` on anything vendored), and `allowed-tools`.

Keep `SKILL.md` under ~500 lines; push field references and long examples into
`references/`, which load only when the skill points at them.

## Say each thing once

A rule repeated in the root file, a surface file, and a skill is three chances
to disagree. Pick the layer that owns it and link from the others.

## Verify

```bash
pnpm check:agent-docs
```

## Related

- `create-skill` is not vendored here — use the official
  `anthropic-skills:skill-creator`, which is already available and ships eval
  tooling.
