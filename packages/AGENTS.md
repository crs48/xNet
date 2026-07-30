# packages/ — library conventions

Loaded on demand when an agent reads files here. Root `AGENTS.md` still applies.

These rules only ever apply to `packages/*`, which is why they live here rather
than in the root file every session pays for.

## Dependency direction

```
crypto → identity → storage → sync → data → react → sdk
                                ↓
                            network → query
```

Lower packages cannot import from higher ones.

## No workflow engine in a package (0411)

**Never add a durable-execution / workflow orchestrator dependency (Temporal,
Restate, DBOS, Inngest, …) to `packages/hub`, `packages/server`, or any client
package.** An orchestrator may only ever be considered for `apps/cloud`.

`packages/hub` has zero external-service dependencies, and `docs/CHARTER.md` §6
cites "the hub is a single self-contained process" as the receipt for _No global
chokepoint tier_. Requiring a self-hoster to operate a workflow cluster to run
their own hub fails the **BATNA** test outright.

Long-running or multi-step work inside a package is made restart-safe the way
the rest of the repo already does it: a pure decision function over stored
state, re-evaluated on a schedule (level-triggered), rather than an engine that
remembers where it was. See ADR-28 and exploration 0411.

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
  package imports it (e.g. `packages/react/src/provider/*` units), leave it out
  of every barrel.
- Removing/renaming anything already exported from a root barrel is a **major**
  bump — bump from the diff.

## Changesets (npm release intent)

Every change to a **publishable** `packages/*` library MUST produce a
`.changeset/*.md` before the turn ends — the `Stop` hook
(`scripts/changeset/assert-coverage.mjs`) enforces this and will block otherwise.

- Run **`/changeset`** (reads the diff, picks the bump per affected package,
  writes the file), or `pnpm changeset` interactively.
- Publishable = `private: false` and not in `.changeset/config.json` `ignore`
  (`node scripts/changeset/publishable-pathspec.mjs` lists the set). Apps,
  private or ignored packages, tests, stories, and docs need **no** changeset.
- Use `pnpm changeset --empty` for refactors/tooling that touch a publishable
  package but aren't consumer-visible.
- Bump from the **diff**, not just the commit prefix: a removed/renamed export,
  changed signature, or changed protocol/hash/wire contract is a **major** even
  if the commit said `feat:`/`fix:`. When unsure, bump higher.
- The `fixed` core (`core`, `crypto`, `data`, `react`, …) versions in lockstep;
  periphery (`cli`, `trust`, `slack-compat`, …) versions independently.

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

## Structured errors: TaggedError (0303)

New structured error classes extend `TaggedError` from `@xnetjs/core`
(`packages/core/src/errors/tagged.ts`) instead of raw `Error`:

- set `_tag` to the class name (string literal), so catch sites can narrow with
  `isTagged(err, 'SomeError')` or a `_tag` switch;
- machine-readable context goes in readonly fields — use a `code` string-literal
  union when one class spans several failure kinds (see `NodeRelayError`,
  `PermissionError`, the exemplars);
- chain underlying causes via `new SomeError(msg, { cause })`, never by
  string-concatenating messages.

Migrate existing `class X extends Error` on touch, not as a campaign.

## Dev-tools seed (new content types)

The dev-tools **Seed** panel populates a demo workspace covering every content
type (`packages/devtools/src/seed/`). It's **idempotent** (deterministic IDs →
LWW upsert; re-running adds only what's missing) and guarded by
`seed-coverage.test.ts`, which asserts every registered, non-excluded schema
gets ≥1 seeded node.

When you add a **new schema**, the Tier-2 auto-generator covers it
automatically. To make the coverage test happy you only act when it's special:

- Rich, linked sample data → add a Tier-1 seeder under `seed/seeders/` and
  register it in `seed-manifest.ts`.
- System/meta infrastructure (not user-facing) → add it to
  `SEED_EXCLUDED_SCHEMA_IDS` in `seed-manifest.ts`.

See `packages/devtools/src/seed/README.md`.
