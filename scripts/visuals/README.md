# Visual UI Capture

Automated, informational screenshots/GIFs of the UI a PR changes, posted as a
sticky PR comment. Built from parts the repo already owns — Playwright,
Storybook, `ffmpeg`, the `publish-gh-pages` action, and the sticky-comment
upsert pattern. Design: [`docs/explorations/0185`](../../docs/explorations/0185_%5B_%5D_CI_VISUAL_UI_CAPTURE_SCREENSHOTS_GIFS_ON_PRS.md).

## Pipeline

```
git diff ──▶ changed-capture-set.mjs ──▶ capture.mjs ──▶ diff.mjs ──▶ comment.mjs
            (which targets changed?)     (screenshot +    (vs main      (sticky PR
                                          record flows)    baseline)     comment body)
                            │                                   │
                     storybook index                    gh-pages baseline
```

Driven by `.github/workflows/visual-capture.yml`:

- **On PRs** (`capture` job): compute the changed set, screenshot it, diff
  against the `main` baseline, publish to the durable top-level
  `visuals/pr/<N>/` namespace on gh-pages, and upsert a `<!-- xnet-visuals -->`
  comment. Path-filtered to UI changes; `continue-on-error` throughout; never a
  required check.
- **On push to `main`** (`baseline` job): capture _every_ story + route and
  publish to `visuals-baseline/` so PRs have something to diff against.

Cleanup (exploration 0189): PR visuals live **outside** the `pr/<N>` preview
tree, so `remove-pr-preview.yml` (which deletes `pr/<N>` on PR close) no longer
takes them with it — merged-PR galleries keep rendering. Instead they are reaped
on **age**: `gh-pages-maintenance.yml` removes `visuals/pr/<N>` for PRs that
merged/closed more than `VISUALS_RETENTION_DAYS` (default 30) ago and rewrites
the corresponding sticky comment to a tombstone so no broken image survives.

> **gh-pages layout coupling.** The production site deploy (`deploy-site.yml`)
> rsyncs the gh-pages **root** with `--delete`, so any top-level dir it doesn't
> `exclude` is wiped on every push to `main`. Both `visuals-baseline/` (the diff
> baseline) and `visuals/` (durable per-PR captures) are therefore listed in that
> workflow's `exclude` (alongside `pr` and `branch`) — without them, they
> disappear and PR galleries break. If you rename either path, update the exclude
> list (and the `capture`-job publish `target` / `BASE_URL`) too.

## Scripts

| Script                    | Role                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| `lib/capture-set.mjs`     | Pure mapping: changed files → story/route/flow targets (unit-tested)        |
| `changed-capture-set.mjs` | CLI around it; reads git diff + Storybook `index.json` (`--all` = baseline) |
| `capture.mjs`             | Screenshots stories (static SB) + routes (live app), records flows          |
| `diff.mjs`                | SSIM + `blend=difference` vs baseline; keeps changed/new only               |
| `comment.mjs`             | Renders the Markdown gallery body (unit-tested)                             |
| `lib/ffmpeg.mjs`          | `ffmpeg` helpers: encode webm→gif/mp4, SSIM, diff image                     |
| `lib/static-server.mjs`   | Zero-dep static server for the Storybook iframe                             |
| `flows.mjs`               | Interaction-flow runners, keyed to `manifests.json` flow ids                |
| `manifests.json`          | Maps source globs → app routes and interaction flows                        |
| `lib/manifest-coverage.test.mjs` | Drift guard: every singleton route must be mapped (or `EXEMPT`)        |

## Tuning

- **What maps to what**: edit `manifests.json` (routes/flows) and the rules in
  `lib/capture-set.mjs` (stories match by `importPath` or co-located component).
- **New workbench surface** (`apps/web/src/routes/<name>.tsx`): add a `routes[]`
  entry mapping its globs → `path`. If the change you want reviewed lives **behind
  a tab, inspector, modal, or seed data** (so a first‑paint route shot can't see
  it), also add a `flows[]` entry + a runner in `flows.mjs` — a static route only
  ever captures the top of funnel. `lib/manifest-coverage.test.mjs` **fails** if a
  new singleton route is left unmapped (or not explicitly `EXEMPT`), so this isn't
  optional. Background: [`docs/explorations/0191`](../../docs/explorations/0191_%5B_%5D_VISUAL_CAPTURE_MISSES_UNMAPPED_AND_INTERACTION_GATED_SURFACES.md).
- **Don't broaden `home`**: keep its globs to the shell (`index`/`__root`/`App`/
  `workbench`). A broad `apps/web/src/components/**` glob false‑matches every
  domain surface onto `/`, hiding the real diff (the 0191 bug); generic UI changes
  that map to no specific route still reach `home` via the fallback.
- **Diff sensitivity**: `diff.mjs --threshold <0..1>` (default `0.998`; lower =
  more tolerant of sub-pixel noise).
- **New flows**: add an entry to `manifests.json#flows` and a runner of the same
  `id` in `flows.mjs`.

## Run it locally

```bash
pnpm test:visuals                 # unit tests (pure logic)
pnpm build:stories                # produces storybook-static/index.json

node scripts/visuals/changed-capture-set.mjs --base origin/main \
  --storybook-index storybook-static/index.json --out tmp/capture-set.json

# stories need no server; routes/flows need the web app running (--web-url)
node scripts/visuals/capture.mjs --set tmp/capture-set.json \
  --out tmp/visuals --storybook-static storybook-static

node scripts/visuals/diff.mjs --manifest tmp/visuals/manifest.json \
  --baseline-dir path/to/baseline --out tmp/visuals
node scripts/visuals/comment.mjs --diff-manifest tmp/visuals/diff-manifest.json \
  --base-url https://example/visuals
```

Requires `ffmpeg` on `PATH` for flow encoding and diffing.
