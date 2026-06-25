---
name: changeset
description: Write a changeset for the current change. Use when you've edited a publishable packages/* library and need to record a semver bump + consumer-facing release note before the turn ends (the Stop hook enforces this). Reads the diff, picks the bump per affected package, and writes .changeset/*.md.
---

# Write a changeset

You are recording an npm release intent for xNet's published packages
(exploration 0220). A changeset is a small `.changeset/<slug>.md` file that tells
Changesets how to bump versions and what to write in each package's CHANGELOG.

## When this applies

Only **publishable** packages need a changeset — i.e. `packages/*` that are
`private: false` and NOT in the `.changeset/config.json` `ignore` list. Run
`node scripts/changeset/publishable-pathspec.mjs` to see the exact set. Changes
limited to apps, private/ignored packages, tests, stories, or docs need **no**
changeset (or an empty one — see below).

## Steps

1. **Find what changed.** Inspect the diff against `main`:

   ```bash
   git diff --stat $(git merge-base HEAD main)...HEAD -- $(node scripts/changeset/publishable-pathspec.mjs)
   pnpm turbo run typecheck --affected --dry-run=json   # affected package list
   ```

2. **Pick the bump per affected package**, reading the actual diff — don't just
   trust the commit prefix:
   - **major** — a breaking change to the public API: a removed/renamed export, a
     changed function signature, or a changed protocol / hash / wire contract.
     Choose this even if the commit said `feat:`/`fix:` when the diff is breaking.
   - **minor** — a backward-compatible new feature/export.
   - **patch** — a bug fix, perf, or internal change with no API impact.
   When in doubt about breakage, choose the **higher** bump.

   Remember the topology: the `fixed` core (`core`, `crypto`, `data`, `react`, …)
   versions in lockstep — a bump to any one fans across all of them, so you only
   need to name one. Periphery packages (`cli`, `trust`, `slack-compat`, …)
   version independently.

3. **Write the changeset.** Prefer the CLI so the frontmatter is valid:

   ```bash
   pnpm changeset            # interactive: pick packages + bump, then write the note
   ```

   Or write `.changeset/<short-kebab-slug>.md` directly:

   ```md
   ---
   '@xnetjs/trust': minor
   ---

   Add `requiresCapabilityReprompt()` for re-consent on capability escalation.
   ```

   The body is **consumer-facing**: say what changed and why it matters to a
   package consumer, not how you implemented it.

4. **For non-consumer-visible work** (refactors, tooling, docs that still touch a
   publishable package's source), record an empty changeset so the Stop hook is
   satisfied and no version is bumped:

   ```bash
   pnpm changeset --empty
   ```

## Notes

- The deterministic floor (`pnpm changeset:from-commits`, run in CI) already maps
  conventional-commit prefixes to bumps; your job is to get the bump *right* from
  the diff and write a good note. In CI, `scripts/changeset/ai-generate.mjs` may
  enrich the note and raise (never lower) the bump.
- The Stop hook (`scripts/changeset/assert-coverage.mjs`) blocks turn-end until
  every changed publishable package is covered. `CHANGESET_SKIP_HOOK=1` opts out.
