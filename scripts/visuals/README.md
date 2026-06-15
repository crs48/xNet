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
  against the `main` baseline, publish to `pr/<N>/visuals/` on gh-pages, and
  upsert a `<!-- xnet-visuals -->` comment. Path-filtered to UI changes;
  `continue-on-error` throughout; never a required check.
- **On push to `main`** (`baseline` job): capture _every_ story + route and
  publish to `visuals-baseline/` so PRs have something to diff against.

Cleanup is automatic: `remove-pr-preview.yml` deletes the whole `pr/<N>` tree
(app preview + visuals) when the PR closes.

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

## Tuning

- **What maps to what**: edit `manifests.json` (routes/flows) and the rules in
  `lib/capture-set.mjs` (stories match by `importPath` or co-located component).
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
