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
  (`spaces`, `work`, `docs`, `database`, `viz`, `comms`, `metrics`, `crm`,
  `accounting`, `integration`) returning `DeterministicNodeImportDraft[]`
  (+ optional Yjs doc builders). These produce the coherent, deeply
  cross-linked demo graph. Cross-link handles (the space tree, nested folders,
  tag palette, people) live in `fixtures.ts` and are passed via
  `SeedContext.fixtures`.
- **Tier 2 — auto-generator** (`auto-generator.ts`): for every _other_
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

| Mode                 | Behaviour                                                          |
| -------------------- | ------------------------------------------------------------------ |
| `converge` (default) | Upsert managed fixtures; fill in what is missing.                  |
| `accrete`            | Converge, then append random-ID volume nodes (scale/perf testing). |
| `reseed`             | Delete the managed set, then converge to a clean state.            |

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

## Relational depth

The seed is built to exercise **every relationship kind** in the app:

- **Databases are filled out** — `database-drafts.ts` emits `DatabaseField`,
  `DatabaseSelectOption`, `DatabaseRow` (cells as `cell_<fieldId>`) and
  `DatabaseView` nodes, including a cross-database `relation` cell. Because these
  are nodes (not Yjs), they **converge and update on re-run**.
- **Nested folders + multi-space** — an org workspace with team sub-spaces + a
  personal space (`fixtures.ts`), and a folder tree ≥3 deep.
- **Deep CRM / ledger** — Org→Contact→Deal→Stage/LineItem/Product, DealContactRole
  junctions, Activities; a chart-of-accounts tree with **balanced** double-entry
  postings linked to deals.
- **Tasks** with subtasks (`parent`), multiple assignees, and links to spec
  pages + canvases; **canvases** with embedded node cards + connectors; multiple
  **rich pages** that embed/mention each other.

`seed-integrity.test.ts` asserts the graph is sound: no dangling references,
every ledger transaction balances, folder depth ≥3, ≥3 spaces + subtasks, and
every database cell reference resolves.

## Content fidelity

Beyond relationships, each node is filled with **real content exercising its
surface's UI patterns** (exploration 0223):

- **Pages** (`docs/rich-pages.ts`) — the full editor vocabulary: headings, lists,
  task lists, quote, code, callouts (all 5), toggle, mermaid, divider, image,
  file, embed, richLink, `pageEmbed`/`databaseEmbed`/`taskViewEmbed`, plus inline
  marks (bold/italic/code/strike/link/wikilink) and inline pills (hashtag,
  taskMention, databaseReference). The "Feature Showcase" page uses every one.
- **Dashboards** (`builders/dashboard-builder.ts`) — populated with real
  runtime-bound widgets (metric/chart/list/saved-view/links/heatmap), each a
  `SavedViewDescriptor` query over seeded schemas, with responsive layouts +
  time-range/custom variables.
- **Databases** — all six view types (table/board/list/gallery/calendar/
  timeline) with filters/sorts/column-summaries, and `dateRange`/`file`/`rollup`/
  `formula`/auto fields.
- **Canvases** (`builders/canvas-builder.ts`) — page/database/media/task/
  external-reference cards, a presentation frame + a group, and styled
  (dashed/curved/colored) connectors across relationship kinds.
- **Domain docs** (`docs/page-builders.ts`) — Task descriptions, Project briefs,
  Milestone notes, CRM org/contact/deal notes, and an Experiment protocol on the
  same Yjs document model.
- **Map** — a basemap, viewport and a GeoJSON markers layer.

> **Render gate:** `seed-render.test.ts` parses every seeded page/doc's
> `content-v4` fragment back through the real BlockNote schema
> (`createXNetSchema` via `yXmlFragmentToBlocks`), and decodes the canvas
> scene — a malformed fragment fails CI instead of rendering blank. Page docs
> are declared as Block JSON in `docs/rich-pages.ts` and converted to Yjs by a
> headless BlockNote editor, so block/inline names + props always match the
> app schema (0312).

## Adding a Tier-1 seeder

1. Write `seeders/<domain>.ts` exporting a `SeederModule` (`domain`, `label`,
   `schemaIds`, `seed(ctx)`), using `seedId(...)` / `ctx.fixtures` for stable
   cross-links and `ctx.rng` for any randomness.
2. Register it in the ordered `SEEDERS` array in `seed-manifest.ts`.
3. Add a unit test in `seeders.test.ts`.
