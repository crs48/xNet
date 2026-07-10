# xNet — agent conventions

## Barrel exports (index.ts) — sub-barrel policy (0276)

The `react`/`data`/`plugins` root barrels are the highest-churn files in the
repo (90/87/47 commits in 8 months) — every feature appending re-exports there
creates standing merge conflicts and degrades tree-shaking.

- **New surface lands in a scoped sub-barrel**, not the root barrel: add (or
  extend) a feature-area file — e.g. `packages/react/src/hooks/index.ts`,
  `packages/data/src/store/index.ts` — and re-export the _area_ from the root
  with ONE grouped block, so the root barrel gains at most one line per area,
  not five lines per feature.
- **Never `export *` from the root barrel** — named re-exports only (keeps
  tree-shaking and makes API-surface diffs reviewable).
- **Internal modules don't get barrel exports at all.** If nothing outside the
  package imports it (e.g. `packages/react/src/provider/*` units), leave it
  out of every barrel.
- Removing/renaming anything already exported from a root barrel is a
  **major** bump (see Changesets below) — bump from the diff.

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

### Release cadence (merging the "Version Packages" PR)

Changesets only **stages** releases — nothing publishes until the standing
`chore(release): version packages` PR (branch `changeset-release/main`) is
merged. That merge is deliberate and human-gated, but it must not rot
(exploration 0265: 10 days of staged work sat unmerged):

- **When an exploration's implementation lands on main, merge the release PR
  once it has refreshed and its checks are green.** Review the staged bumps
  first — audit any `major` against the actual diffs (policy above).
- If `.changeset/` is piling up (dozens of files), releases have stalled —
  check the `npm Release` workflow runs and the release PR before adding more.

## CI lanes and tests (0294)

Any new workflow, job, or advisory check must have a **named consumer**
(someone or something acts on its output) and a **decidable pass condition**
(it can actually go green). A gate that can't pass — e.g. failing a whole-repo
standing-debt count — or whose output nobody reads is worse than no gate: it
teaches everyone to ignore red. Ratchet against a committed baseline instead
of gating absolutes, and prefer deleting an unconsumed lane (git remembers).

Every Playwright spec in `tests/e2e/src/` must be referenced by at least one
workflow or documented gate script (`validate:canvas-v2`). Orphans rot
silently — wire them into the nightly soak lane or delete them.

**On-touch integration→unit rewrites** (do when already editing the file, not
as a campaign — these use real timers/servers/disk and are the suite's flake
reservoir): `packages/canvas/src/__tests__/chunked-storage.test.ts`,
`packages/canvas/src/__tests__/presence.test.ts`,
`packages/runtime/src/sync/sync-manager.test.ts`,
`packages/hub/test/relay.test.ts`, `packages/hub/test/crawl.test.ts`,
`tests/integration/src/webrtc-signaling.test.ts`,
`packages/sqlite/src/adapter.test.ts` (prefer `:memory:`).

## Commits

Conventional Commits are enforced (commitlint). `feat:` → minor, `fix:`/`perf:` →
patch, `feat!:` / `BREAKING CHANGE:` → major.

## Dev-tools seed (new content types)

The dev-tools **Seed** panel populates a demo workspace covering every content
type (`packages/devtools/src/seed/`). It's **idempotent** (deterministic IDs →
LWW upsert; re-running adds only what's missing) and guarded by
`seed-coverage.test.ts`, which asserts every registered, non-excluded schema
gets ≥1 seeded node.

When you add a **new schema**, the Tier-2 auto-generator covers it automatically.
To make the coverage test happy you only act when it's special:

- Rich, linked sample data → add a Tier-1 seeder under `seed/seeders/` and
  register it in `seed-manifest.ts`.
- System/meta infrastructure (not user-facing) → add it to
  `SEED_EXCLUDED_SCHEMA_IDS` in `seed-manifest.ts`.

See `packages/devtools/src/seed/README.md`.
