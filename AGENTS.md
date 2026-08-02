# AGENTS.md — xNet coding agent guidelines

xNet is a local-first, CRDT-backed workspace: your data, synced everywhere,
owned by you. This file is loaded every session — keep it small. Surface-specific
conventions live in nested `AGENTS.md` files that load only when you read files
there.

## Skills

Invoke with the Skill tool. Repo-local skills live in `.claude/skills/`
(`.agents/skills` symlinks to it for Codex and Copilot).

| Skill                            | Read it when                                        |
| -------------------------------- | --------------------------------------------------- |
| `babysit-pr`                     | Driving a PR to green                               |
| `changelog`                      | You shipped something a user would notice           |
| `changeset`                      | You edited a publishable `packages/*` library       |
| `electron-prototype`             | Building or testing anything in `apps/electron`     |
| `explore`                        | Researching a topic into `docs/explorations/`       |
| `humanize`                       | Prose reads as machine-written; editing blog essays |
| `implement`                      | Executing an exploration's checklist                |
| `mvp-followup`                   | Deciding what to close out after a feature pass     |
| `verification-before-completion` | Before claiming done, or writing `[x]`              |
| `visual-exploration`             | An exploration is about UI and prose cannot show it |
| `writing-agent-instructions`     | Editing any `AGENTS.md` or `SKILL.md`               |

## Nested instructions

| Path                      | Covers                                   |
| ------------------------- | ---------------------------------------- |
| `apps/web/AGENTS.md`      | Playwright, test auth bypass, viewport   |
| `apps/electron/AGENTS.md` | Prototyping ladder, ports, preload       |
| `apps/expo/AGENTS.md`     | Expo/EAS, no Node APIs                   |
| `packages/AGENTS.md`      | Barrels, changesets, `TaggedError`, seed |
| `packages/hub/AGENTS.md`  | Roles, wire format, authorization        |

<!-- Nested files are NOT re-injected after /compact; anything that must hold
     for a whole session belongs in this file, not a nested one. -->

## Build & test

```bash
pnpm install                      # install
pnpm build                        # build all packages
pnpm test                         # all tests (~2400)
pnpm --filter @xnetjs/data test   # one package
pnpm typecheck                    # turbo run typecheck
pnpm lint
```

Vitest resolves the **root** config: `pnpm --filter <pkg> test` runs every
project. Target one with `pnpm exec vitest run --project <name> <path>`.

## Project structure

`packages/*` are the libraries, `apps/*` the surfaces (`web`, `electron`,
`expo`, `cloud`, `demos`), `site/` the Astro marketing + docs site, `tests/*`
the e2e and reliability suites. `site/` installs with `--ignore-workspace` — it
cannot import `@xnetjs/*`.

## Spelling the brand: `xNet`

Lowercase x, uppercase N — in **everything a human reads**: prose, doc titles,
code comments, UI strings, CLI help, package descriptions, commit messages.
Never `XNet`, `Xnet` or `XNET`. Sentence-initial is still `xNet`; recast the
sentence rather than capitalising the mark.

Lowercase everywhere a machine reads: `@xnetjs/*`, the `xnet` bin, `xnet://`
URIs, file and database names.

| Where                                                 | Form                                    |
| ----------------------------------------------------- | --------------------------------------- |
| Prose, comments, UI strings, commits                  | `xNet`                                  |
| npm packages, bins, URLs, DB/file names, env prefixes | all lowercase                           |
| Identifiers already named `XNet*`                     | leave as-is (`XNetProvider`, `useXNet`) |
| Mermaid node ids, `SCREAMING_SNAKE` constants         | leave as-is (`XNET_HUB_URL`)            |

**Existing identifiers keep their casing** — renaming one is a breaking change,
not a copy fix. The line is identifier vs copy, and it does not follow file
type: code samples inside markdown are code. When sweeping, match on a word
boundary (`\bXNet\b`) and skip fenced code blocks — `docs/plans/` and
`docs/explorations/` quote an `XNet` SDK class that an unbounded replace
silently corrupts.

## Code style

- **Imports**: named over default; type-only imports use `import type`.
- **Naming**: `camelCase` values, `PascalCase` types and components,
  `SCREAMING_SNAKE` consts.
- **TypeScript**: no `any` in new code; prefer inference over annotation.
- **Exports**: see `packages/AGENTS.md` for the sub-barrel policy.
- **Comments**: match the surrounding density. Explain _why_, not _what_.
- **React**: hooks at the top, no conditional hooks, prefer composition.
- **Styling**: prefer Tailwind over custom CSS.
- **Errors**: a `catch`, default, or coercion that returns a value callers
  cannot distinguish from success is a bug, not a guard. "Absent" and
  "unreadable" must be different values; a truncated run is not a completed one.
  Prefer a loud, typed failure over a plausible-looking normal state.

## Testing

Unit tests for core packages are required. Do not write UI tests — verify UI by
driving the real app (see the surface files). Any new Playwright spec in
`tests/e2e/src/` must be referenced by a workflow or a documented gate script;
orphans rot silently.

Any new workflow, job, or advisory check needs a **named consumer** and a
**decidable pass condition**. A gate that cannot go green teaches everyone to
ignore red. Ratchet against a committed baseline instead of gating absolutes.

A gate also needs a **proof it can go red** — a negative control (exploration
0430). Green is otherwise unfalsifiable: a regex that silently stopped matching
after a rename looks exactly like a clean codebase. Add a `--selftest` that
plants violations the gate MUST flag, run it in CI beside the real scan, and keep
its fixtures **in memory** rather than on disk, so a control can never leak into
the production scan.

## Decisions

A **one-way door** (wire format, public API, licence, a revenue lane) earns an
ADR in `site/src/content/docs/docs/architecture/decisions.mdx` — and that ADR
carries a **`Tripwire:`**, the observation that re-opens it. Accepted ADRs stay
immutable; adding a tripwire is additive, and is the one edit besides typo and
link fixes. Without one a decision decays into a rule nobody remembers the reason
for (exploration 0430).

## Commits

Conventional Commits, enforced by commitlint: `feat:` → minor, `fix:`/`perf:` →
patch, `feat!:` / `BREAKING CHANGE:` → major.

```
feat(sync): add peer scoring for Yjs updates
fix(data): handle null schema in NodeStore
docs(exploration): add pre-commit quality gates plan
```

Hooks run `lint-staged`, `turbo typecheck --affected` and changed-file tests on
commit, and `pnpm typecheck && pnpm test` on push. **Never use `--no-verify` to
bypass a failure your change caused** — fix it. A known-unrelated flake is the
only exception, and CI is still the real gate.

## Changelog

Every PR must add a changelog fragment or carry the `skip-changelog` label — the
`changelog-section` check enforces it. Write for end users: "Deals now sync
after import," not `fix(schema): correct relation validation`.

```bash
node scripts/changelog/new.mjs --title "Deals now sync after import" \
  --summary "Importing contacts no longer creates duplicate deals." --tags crm
```

Separate from Changesets (`packages/AGENTS.md`), which targets library
consumers.

## Sync architecture

| Data type  | Mechanism | Conflict resolution       |
| ---------- | --------- | ------------------------- |
| Rich text  | Yjs CRDT  | Character-level merge     |
| Structured | NodeStore | Field-level LWW (Lamport) |

## Key constraints

**Do:** read code before assuming (grep, don't guess); reuse existing patterns;
keep changes minimal and focused; kill dev servers when done.

**Don't:** add features beyond what was requested; store computed values
(formula, rollup — compute at read); skip tests for core packages; use
heavyweight frameworks.

## graphify

This repo has a knowledge graph at `graphify-out/`.

- For codebase questions, run `graphify query "<question>"` when
  `graphify-out/graph.json` exists. `graphify path "<A>" "<B>"` for
  relationships, `graphify explain "<concept>"` for focused concepts — each
  returns a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw
  grep.
- Dirty `graphify-out/` files are expected after hooks; not a reason to skip it.
- Prefer `graphify-out/wiki/index.md` for broad navigation; read
  `GRAPH_REPORT.md` only when query/path/explain don't surface enough.
- After modifying code, run `graphify update .` (AST-only, no API cost).
