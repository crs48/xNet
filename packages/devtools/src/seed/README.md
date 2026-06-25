# Dev-tools database seed

A thorough, **idempotent** seed that populates a demo workspace covering every
registered content type — projects, tasks, pages, canvases, dashboards,
channels, comments, metrics and more — plus the relationships between them.

Use it from the **Seed** dev-tools panel ("Seed everything"), or the **Reset**
panel's quick Seed/Reseed actions. Programmatically:

```ts
import { runSeed } from '@xnetjs/devtools/seed' // (internal import path)

await runSeed({ store, scale: 'medium' }) // converge — idempotent
```

## How it works

Two tiers, behind a space-first runner:

- **Tier 1 — curated seeders** (`seeders/*.ts`): one pure function per domain
  (`spaces`, `work`, `docs`, `database`, `viz`, `comms`, `metrics`) returning
  `DeterministicNodeImportDraft[]` (+ optional Yjs doc builders). These produce
  the coherent, richly cross-linked demo graph.
- **Tier 2 — auto-generator** (`auto-generator.ts`): for every *other*
  registered schema, synthesize one representative node from its field
  definitions. New schemas get sample data automatically.

The **runner** (`seed-runner.ts`):

1. Creates the demo `Space` first and reads the author DID back (so cascade
   authz grants every later write).
2. Collects all drafts + docs, tallies per-schema created/updated.
3. Upserts via `store.importDeterministicNodes` (LWW merge) in batches.
4. Applies Yjs documents **only for newly-created nodes** (re-applying a fresh
   doc would merge into duplicate blocks).
5. Rebuilds deferred indexes.

## Idempotency

Every managed node ID is deterministic (`seed/<domain>/<slug>`), so re-running
**converges** — it never duplicates. Modes:

| Mode | Behaviour |
|------|-----------|
| `converge` (default) | Upsert managed fixtures; fill in what is missing. |
| `accrete` | Converge, then append random-ID volume nodes (scale/perf testing). |
| `reseed` | Delete the managed set, then converge to a clean state. |

> Yjs document **content** is written once (on create) and not rewritten on
> re-run, so re-seeding never duplicates blocks. To refresh document content,
> wipe local data (Reset → Clear local) and seed fresh.

## Coverage guarantee

`seed-coverage.test.ts` runs the full seed against an in-memory store and asserts
**every registered, non-excluded schema produced at least one node**. A new
content schema therefore can't ship without seed data:

- It's covered automatically by the Tier-2 auto-generator, **or**
- you add a Tier-1 seeder for a richer fixture, **or**
- if it's system/meta infrastructure, add it to `SEED_EXCLUDED_SCHEMA_IDS` in
  `seed-manifest.ts`.

## Adding a Tier-1 seeder

1. Write `seeders/<domain>.ts` exporting a `SeederModule` (`domain`, `label`,
   `schemaIds`, `seed(ctx)`), using `seedId(...)` for stable IDs and `ctx.rng`
   for any randomness.
2. Register it in the ordered `SEEDERS` array in `seed-manifest.ts`.
3. Add a unit test in `seeders.test.ts`.
