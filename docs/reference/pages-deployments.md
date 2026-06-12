# GitHub Pages Deployments

How xnet.fyi is published, including per-PR and per-branch preview deploys.
Background and design rationale:
[exploration 0169](../explorations/0169_[_]_PER_PR_AND_PER_BRANCH_PAGES_PREVIEW_DEPLOYS.md).

## URL scheme

Everything is served from the `gh-pages` branch at `https://xnet.fyi`:

| Path                  | Content              | Written by                                                                     |
| --------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `/`                   | Astro marketing site | [deploy-site.yml](../../.github/workflows/deploy-site.yml) on push to `main`   |
| `/app/`               | Production web app   | same                                                                           |
| `/pr/<N>/app/`        | Preview of PR #N     | [deploy-pr-preview.yml](../../.github/workflows/deploy-pr-preview.yml)         |
| `/branch/<slug>/app/` | Preview of a branch  | [deploy-branch-preview.yml](../../.github/workflows/deploy-branch-preview.yml) |

`<slug>` is the branch name with slashes flattened to dashes (`feat/foo` →
`feat-foo`).

## How previews work

- **PR previews** deploy automatically on every PR open/update (same-repo
  branches only; fork PRs are skipped for token-security reasons). The PR gets
  a sticky comment with the link plus a native `pr-<N>` deployment environment,
  so GitHub renders a "View deployment" button. On close, the preview
  directory is deleted and the environment's deployments are marked inactive.
- **Branch previews** are opt-in: pushes to `preview/**` branches deploy
  automatically, and any other branch can be deployed by running the
  "Deploy Branch Preview" workflow on that ref (`gh workflow run
deploy-branch-preview.yml --ref my-branch`). The preview URL is written to
  the run summary. Deleting the branch removes the preview.
- All gh-pages writers go through the
  [publish-gh-pages](../../.github/actions/publish-gh-pages/action.yml)
  composite action, which retries the fetch → sync → push sequence three
  times so concurrent deploys never fail each other. The production deploy
  excludes `pr/` and `branch/` from its `rsync --delete`.
- [gh-pages-maintenance.yml](../../.github/workflows/gh-pages-maintenance.yml)
  runs weekly: it sweeps orphaned preview directories (closed PRs, deleted
  branches) and squashes gh-pages history to a single commit so the repository
  does not accumulate every historical bundle.

## Storage scoping

Previews share production's browser-storage origin (path ≠ origin), so
preview builds are compiled with `VITE_STORAGE_SCOPE` (`pr-<N>` or
`branch-<slug>`). The web app publishes the scope as a
`__XNET_STORAGE_SCOPE__` global ([storage-scope.ts](../../apps/web/src/lib/storage-scope.ts)
— deliberately the first import in `main.tsx`), and scope-aware stores suffix
their IndexedDB database names with it (e.g. `xnet-identity--pr-42` in
[packages/identity/src/passkey/storage.ts](../../packages/identity/src/passkey/storage.ts)).
A preview can therefore never open or corrupt production databases. Unscoped
builds (production, local dev) keep the unsuffixed names.

When adding a new client-side store, derive its database name the same way.
