# xNet — agent conventions

## Changesets (npm release intent)

Every change to a **publishable** `packages/*` library MUST produce a
`.changeset/*.md` before the turn ends — the `Stop` hook
(`scripts/changeset/assert-coverage.mjs`) enforces this and will block otherwise.

- Run **`/changeset`** (reads the diff, picks the bump per affected package,
  writes the file), or `pnpm changeset` interactively.
- Publishable = `private: false` and not in `.changeset/config.json` `ignore`
  (`node scripts/changeset/publishable-pathspec.mjs` lists the set). Apps, private
  or ignored packages, tests, stories, and docs need **no** changeset.
- Use `pnpm changeset --empty` for refactors/tooling that touch a publishable
  package but aren't consumer-visible.
- Bump from the **diff**, not just the commit prefix: a removed/renamed export,
  changed signature, or changed protocol/hash/wire contract is a **major** even
  if the commit said `feat:`/`fix:`. When unsure, bump higher.
- The `fixed` core (`core`, `crypto`, `data`, `react`, …) versions in lockstep;
  periphery (`cli`, `trust`, `slack-compat`, …) versions independently. See
  `docs/explorations/0220_[_]_AUTOMATED_NPM_PACKAGE_PUBLISHING_AND_CONVENTIONAL_VERSIONING.md`.

## Commits

Conventional Commits are enforced (commitlint). `feat:` → minor, `fix:`/`perf:` →
patch, `feat!:` / `BREAKING CHANGE:` → major.
