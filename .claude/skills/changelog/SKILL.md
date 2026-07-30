---
name: changelog
description: >-
  Write an xNet changelog fragment, or decide that skip-changelog is the right
  answer. Use when you shipped something a user would notice, when the
  assert-fragment Stop hook blocks a turn, or when the changelog-section check
  fails a PR.
license: MIT
compatibility: Requires node and the repo checkout
allowed-tools: Bash(node:*) Bash(gh:*) Read
metadata:
  source: https://github.com/BuilderIO/agent-native/blob/main/.agents/skills/changelog/SKILL.md
  local-changes: >-
    Rewritten for scripts/changelog/new.mjs and site/src/data/changelog; the
    agent-native CLI, release rollup and in-app CommandMenu wiring were dropped.
---

# Changelog fragments

Every PR must either add a fragment or carry the **`skip-changelog`** label. The
`changelog-section` required check enforces it, and a `Stop` hook
(`scripts/changelog/assert-fragment.mjs`) nudges before the turn ends. The hook
blocks exactly once — it is a nudge, not a gate, because fragment-worthiness is
a judgment call.

## Does this change need one?

Add a fragment when a **user of the app** would notice:

- a new capability or surface
- a visible improvement — speed, layout, copy, defaults
- a bug fix that changes behaviour they would see

Use `skip-changelog` when they would not:

- refactors, internal tooling, test-only changes
- CI, workflows, scripts
- docs and explorations
- dependency bumps with no visible effect

The honest test: could you describe it to a customer without explaining the
codebase? If not, it is a `skip-changelog`.

## Writing one

```bash
node scripts/changelog/new.mjs \
  --title "Deals now sync after import" \
  --summary "Importing contacts no longer creates duplicate deals." \
  --tags crm,sync \
  --highlight "Dedup on email"
```

That writes `site/src/data/changelog/<date>-<slug>.json`. **Commit it in the
PR** — nothing is written to `main` out of band. You do not supply the PR
number; `deploy-site` fills it in from git history at deploy time.

Valid `--tags`: `app`, `crm`, `finance`, `tasks`, `ai`, `plugins`, `editor`,
`sync`, `identity`, `platform`, `performance`, `devtools`, `ci`.

## Wording

Lead with what the user can now do, in their vocabulary.

- ✅ "Deals now sync after import"
- ❌ `fix(schema): correct relation validation`
- ✅ "Recordings can be trimmed before sharing"
- ❌ "Added trim support to the recording pipeline"

One sentence, present tense, no file names or internal jargon.

## Applying the label instead

```bash
gh pr edit <N> --add-label skip-changelog
```

## Not the same as Changesets

Changesets (`/changeset`, `packages/AGENTS.md`) records a **semver bump for
library consumers**. This changelog is **product notes for end users**. A PR can
need both, either, or neither.
