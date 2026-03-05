# xNet npm Release Quickstart

Short step-by-step checklist to get automated npm publishing live.

## Your exact values

- GitHub user/org: `crs48`
- GitHub repo: `xNet`
- Workflow filename: `npm-release.yml`
- npm user: `csmothers`
- npm org/scope: `xnetjs` / `@xnetjs/*`

## 1) Verify repo wiring (already in this repo)

Confirm these files exist:

- `.github/workflows/npm-release.yml`
- `.changeset/config.json`

Confirm release scripts work:

```bash
pnpm install
pnpm changeset --help
pnpm version-packages --help
```

## 2) Configure npm Trusted Publishing (manual UI)

For each package you want to publish now:

1. Open package settings on npmjs.com.
2. Open **Trusted Publisher** settings.
3. Select **GitHub Actions**.
4. Enter:
   - Organization/user: `crs48`
   - Repository: `xNet`
   - Workflow filename: `npm-release.yml`
   - Environment name: leave blank (unless you add one in workflow)
5. Save.

Notes:

- First publish creates package records automatically if they don't exist yet.
- You do not need to pre-create packages manually.

## 3) Run a local release dry-run

```bash
pnpm build
pnpm changeset status
pnpm -r --filter "@xnetjs/*" publish --dry-run --access public --report-summary --no-git-checks
```

## 4) Trigger first automated release

Create a changeset in your PR:

```bash
pnpm changeset
git add .
git commit -m "chore(release): add changeset"
git push
```

Then:

1. Merge PR to `main`.
2. GitHub Action opens/updates the Version PR.
3. Merge the Version PR.
4. Publish runs automatically.

## 5) Validate success

- GitHub Actions: `npm Release` workflow is green.
- npm: packages under `@xnetjs/*` show new versions.
- npm: provenance appears on package page.
- Smoke test in clean project:

```bash
npm i @xnetjs/react@latest
```

## 6) Post-launch hardening

After first successful OIDC publish:

1. In npm package settings, disallow token-based publishing.
2. Revoke old npm automation tokens (if any).
