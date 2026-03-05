# npm Release Runbook (@xnetjs)

This runbook describes how to operate automated npm publishing for the xNet monorepo.

## Release model

- Versioning and changelogs are managed with Changesets.
- Publishing is automated by `.github/workflows/npm-release.yml` on `main`.
- The workflow uses `changesets/action` to either:
  - open/update a "version packages" PR, or
  - publish packages after that PR is merged.
- Publishing is intended to use npm trusted publishing (OIDC), not long-lived npm tokens.

## One-time setup

1. **Configure npm trusted publisher** for each publishable package (or org policy):
   - repository: `crs48/xNet`
   - workflow file: `npm-release.yml`
   - branch: `main`
2. **Confirm workflow permissions** include `id-token: write` (already set in workflow).
3. **Optional hardening:** require a protected GitHub Environment for release job approvals.
4. **Optional hardening after first good release:** remove/revoke legacy automation npm tokens.

## Standard release flow

1. Create a feature PR that changes one or more release-managed packages.
2. Add a changeset:

```bash
pnpm changeset
```

3. Choose package(s) and semver bump type (patch/minor/major), then write summary text.
4. Merge PR to `main`.
5. Workflow opens/updates a release PR (`chore(release): version packages`).
6. Review and merge the release PR.
7. Workflow publishes changed packages to npm.

## Local validation commands

Before merging significant release-related changes:

```bash
pnpm build
pnpm changeset status
pnpm -r --filter "@xnetjs/*" publish --dry-run --access public --report-summary --no-git-checks
```

Notes:

- `pnpm publish` enforces a clean git tree by default. Use `--no-git-checks` only for local dry-runs.
- If a package has a `bin`, ensure the package is built before dry-run publish.

## Adding a new package to the release set

A package should satisfy all of the following:

1. `main`/`types`/`exports` resolve to built `dist/*` files (not `src/*.ts`).
2. `files` includes at least `dist`, `README.md`, `LICENSE`.
3. `license` is set (`MIT` in this repo).
4. `publishConfig` includes:

```json
{
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

5. Package is removed from `.changeset/config.json` `ignore` list.
6. Package dry-run publish succeeds.

## Current release scope

Release-managed set currently includes:

- `@xnetjs/core`
- `@xnetjs/crypto`
- `@xnetjs/identity`
- `@xnetjs/sync`
- `@xnetjs/sqlite`
- `@xnetjs/storage`
- `@xnetjs/data`
- `@xnetjs/data-bridge`
- `@xnetjs/plugins`
- `@xnetjs/cli`
- `@xnetjs/history`
- `@xnetjs/react`

Other packages remain intentionally ignored in Changesets until their packaging contracts are finalized.

## Troubleshooting

### "No changesets found"

- Cause: release-managed packages changed without a `.changeset/*.md` file.
- Fix: run `pnpm changeset` (or `pnpm changeset --empty` for non-release operational changes).

### Trusted publishing/OIDC failure

- Verify npm trusted publisher repository/workflow/branch match exactly.
- Verify workflow includes `id-token: write`.
- Verify publish is running from `main` and expected workflow file name.

### `ERR_PNPM_GIT_UNCLEAN` during local dry-run

- Use `--no-git-checks` for local dry-run only.
- Do not disable git checks for real release automation.

### Package missing expected files on npm

- Check `files` in `package.json`.
- Run local `publish --dry-run` and inspect tarball contents in output.

## Recovery playbook

If a release workflow fails:

1. Open the failed GitHub Actions run and identify failing step.
2. Fix issue in a normal PR (do not force publish).
3. Merge PR to `main`; workflow will re-evaluate changes and publish only unpublished versions.

If a wrong version was published:

1. Do **not** rely on unpublish except within npm policy limits.
2. Ship a corrective patch version immediately.
3. Add a follow-up changeset and document the correction in changelog notes.
