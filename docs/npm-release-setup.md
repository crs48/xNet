# Automated npm Release — Setup Guide

Everything you need to configure **npm** and **GitHub** so that `@xnetjs/*`
packages publish automatically, securely, and reproducibly when changes merge to
`main`. Follow the parts in order — **Part 1 (bootstrap) is the one blocking
publishing right now.**

> Companion docs: [`npm-release-quickstart.md`](npm-release-quickstart.md) (the
> short checklist) and [`npm-release-runbook.md`](npm-release-runbook.md) (how to
> operate releases day-to-day). The design rationale is exploration
> `0220_[x]_AUTOMATED_NPM_PACKAGE_PUBLISHING_AND_CONVENTIONAL_VERSIONING.md`.

## Your values (fill these into every step)

| Thing | Value |
| --- | --- |
| GitHub org/user | `crs48` |
| GitHub repo | `xNet` |
| Release workflow file | `npm-release.yml` |
| AI-changeset workflow file | `ai-changeset.yml` |
| npm scope | `@xnetjs` |
| npm account | `csmothers` |
| Release branch | `main` |

## How the pipeline works (1-minute model)

```
PR ──(changeset added by /changeset, the agent Stop hook, or the
      ai-changeset CI backstop)──▶ merge to main
   └─▶ npm-release.yml runs changesets/action
        ├─ changesets present  → opens/updates a "Version PR"
        │                         (chore(release): version packages)
        └─ you merge the Version PR → second run → `changeset publish`
             └─▶ npm (OIDC trusted publishing + provenance)
```

- **Versioning** is two-tier: a `fixed` lockstep protocol core (`core`, `crypto`,
  `identity`, `sync`, `sqlite`, `storage`, `data`, `data-bridge`, `history`,
  `plugins`, `react`, `abuse` — one shared version) and an **independent**
  periphery (`cli`, `runtime`, `trust`, `slack-compat`, `billing`, `devkit`, …).
- **Auth** is **OIDC trusted publishing** — no long-lived npm token lives in the
  repo. The release job has `id-token: write` and publishes with provenance.
- **A human gate** sits between every change and a publish: you merge the Version
  PR. Nothing publishes silently.

## Prerequisites

- You're an **owner** of the `@xnetjs` npm scope (or org) and an **admin** of the
  `crs48/xNet` GitHub repo.
- **2FA enabled** on your npm account (npm requires it for publishing).
- npm CLI ≥ **11.5.1** locally if you bootstrap by hand (the CI workflow already
  pins `npm@latest`).

---

## Part 1 — One-time npm bootstrap (DO THIS FIRST)

**Why:** npm OIDC trusted publishing **cannot create a brand-new package** — the
package must already exist on the registry before OIDC can publish to it. The
first publish of any new package must use a **token**. The original packages
(`core`, `crypto`, `react`, …) were bootstrapped this way, then switched to OIDC.

**These 6 packages have never been published** and are blocking the release:

| Package | Why it must publish |
| --- | --- |
| `@xnetjs/trust` | runtime dep of published `@xnetjs/plugins` |
| `@xnetjs/slack-compat` | runtime dep of published `@xnetjs/plugins` |
| `@xnetjs/billing` | public-API dep of published `@xnetjs/react` |
| `@xnetjs/devkit` | runtime dep of published `@xnetjs/cli` |
| `@xnetjs/abuse` | member of the `fixed` core (added after the first bootstrap) |
| `@xnetjs/runtime` | dep of `react`/`cli` (added after the first bootstrap) |

> ⚠️ **Until these exist on npm, do not merge the pending Version PR** — it would
> publish `@xnetjs/plugins@0.0.3` referencing `@xnetjs/trust@0.0.2` (which would
> fail), producing an **un-installable** package. Bootstrap first.

### 1a. Create an npm token

On npmjs.com → your avatar → **Access Tokens** → **Generate New Token** →
**Granular Access Token** (preferred over a classic automation token):

- **Packages and scopes:** Read and write, restricted to the **`@xnetjs`** scope.
- **Expiration:** as short as practical (e.g. 7 days — you only need it once).
- Copy the token (starts with `npm_…`).

### 1b. Bootstrap-publish the 6 packages

Pick **one** of the two options.

**Option A — via the release workflow (recommended; reuses the exact build +
provenance path).**

1. Add the token as a repo secret: GitHub → repo **Settings → Secrets and
   variables → Actions → New repository secret** → name `NPM_TOKEN`, value the
   `npm_…` token.
2. On a short-lived branch, add **one line** to the publish step in
   [`.github/workflows/npm-release.yml`](../.github/workflows/npm-release.yml) so
   `changeset publish` authenticates with the token (a token *can* create new
   packages; OIDC cannot):

   ```yaml
   - name: Create release PR or publish
     id: changesets
     uses: changesets/action@v1
     with:
       # …unchanged…
     env:
       GITHUB_TOKEN: ${{ secrets.RELEASE_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} # ← TEMPORARY, bootstrap only
   ```

   Provenance still attaches because the job keeps `id-token: write`.
3. Merge that branch, then **merge the pending Version PR**
   (`chore(release): version packages`). The token publishes **all** packages in
   one pass — existing ones bump, the 6 new ones get created.
4. **Revert the one-line change** (remove `NODE_AUTH_TOKEN`) so the pipeline is
   back to token-less OIDC. Then continue to Part 2.

**Option B — manually from your machine (no workflow edit).**

```bash
git checkout main && git pull
pnpm install

# Build the 6 packages AND their dependency closures. Use turbo (not
# `pnpm --filter ... run build`): some of these import other @xnetjs packages
# (e.g. runtime → plugins), and the .d.ts build fails unless those deps are
# built first. turbo's `build` task `dependsOn: ["^build"]`, so it orders them.
pnpm turbo run build \
  --filter=@xnetjs/trust --filter=@xnetjs/slack-compat \
  --filter=@xnetjs/billing --filter=@xnetjs/devkit \
  --filter=@xnetjs/abuse --filter=@xnetjs/runtime
# (or simply `pnpm build` to build the whole workspace — foolproof)

# authenticate this shell with the token
export NODE_AUTH_TOKEN="npm_xxxxxxxx"
npm config set //registry.npmjs.org/:_authToken "$NODE_AUTH_TOKEN"

# Every package sets publishConfig.provenance:true, but provenance can only be
# generated in CI via OIDC — from a laptop it errors `Automatic provenance
# generation not supported for provider: null`. publishConfig OVERRIDES npm
# config/env, so NPM_CONFIG_PROVENANCE=false does NOT help; temporarily strip
# provenance from the 6, publish, then restore. (The OIDC release that follows —
# when you merge the Version PR — re-enables provenance on the real versions.)
for p in trust slack-compat billing devkit abuse runtime; do
  node -e "const f='packages/$p/package.json',j=require('./'+f);delete j.publishConfig.provenance;require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
done

# pnpm publish rewrites workspace:* deps to real versions (npm publish does NOT)
pnpm --filter "@xnetjs/trust" --filter "@xnetjs/slack-compat" \
     --filter "@xnetjs/billing" --filter "@xnetjs/devkit" \
     --filter "@xnetjs/abuse" --filter "@xnetjs/runtime" \
     publish --access public --no-git-checks

# restore the committed package.json files (provenance:true comes back)
git checkout -- packages/{trust,slack-compat,billing,devkit,abuse,runtime}/package.json
```

After they exist on npm, you can merge the Version PR and let OIDC publish the
version bumps as usual.

> The bootstrap establishes the package **names** on npm. The exact version you
> bootstrap at doesn't matter — the next OIDC release publishes the bumped
> versions from the Version PR.

---

## Part 2 — Configure npm Trusted Publishing (OIDC) for every package

Do this for **all** published packages. The original set already has it; the 6
just-bootstrapped packages need it now that they exist.

For **each** package, on npmjs.com:

1. Open `https://www.npmjs.com/package/@xnetjs/<name>/access` (Settings tab).
2. Find **Trusted Publisher** → **GitHub Actions** → and enter exactly:
   - **Organization or user:** `crs48`
   - **Repository:** `xNet`
   - **Workflow filename:** `npm-release.yml`
   - **Environment:** leave blank (we don't use a GitHub Environment; see the
     optional hardening in Part 4).
3. Save.

Notes:

- The **workflow filename must match exactly** (`npm-release.yml`). Renaming the
  workflow later silently breaks publishing until you update this.
- Trusted publishing requires npm CLI ≥ 11.5.1; the workflow pins `npm@latest`.
- The full publishable set today:
  `core, crypto, identity, sync, sqlite, storage, data, data-bridge, history,
  plugins, react, abuse` (fixed core) and
  `cli, runtime, trust, slack-compat, billing, devkit` (independent).

---

## Part 3 — Lock npm down (security)

Do these **after** Part 1 + 2 succeed at least once.

- [ ] **Revoke the bootstrap `NPM_TOKEN`** (npm → Access Tokens → revoke) and
      delete the `NPM_TOKEN` repo secret. OIDC needs no stored token.
- [ ] **Disallow token publishing per package** so only the trusted publisher can
      release: each package → Settings → **Publishing access** → require
      two-factor auth / **"Require trusted publisher"** (disallow tokens). This is
      the single biggest hardening — it makes a leaked token useless for publish.
- [ ] **Require 2FA org-wide** (if `@xnetjs` is an org: Org → Settings → require
      2FA for all members).
- [ ] **Keep provenance on** — it's already set (`publishConfig.provenance: true`
      on every package); the green "provenance" badge proves each tarball was
      built by this repo's Actions.
- [ ] If you ever need a token again (e.g. a new-package bootstrap), use a
      **granular, scope-restricted, short-expiry** token and revoke it after.

Why this is secure: no long-lived credential is stored anywhere; each publish is
authenticated by a per-run, workflow-scoped GitHub OIDC token that npm verifies
against the trusted-publisher config, and provenance ties the artifact to the
exact commit + workflow run.

---

## Part 4 — GitHub configuration

### 4a. Workflow permissions (required)

GitHub → repo **Settings → Actions → General → Workflow permissions**:

- [ ] **Read and write permissions** (so `changesets/action` can open the Version
      PR and push tags).
- [ ] **Allow GitHub Actions to create and approve pull requests** ✔ — without
      this the Version PR never opens.

`id-token: write` is already declared in `npm-release.yml`; nothing to change.

### 4b. Secrets & variables

GitHub → **Settings → Secrets and variables → Actions**:

| Name | Type | Purpose | Required? |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | secret | AI changeset note enrichment (`ai-changeset.yml`) + Electron release notes. Use a **no-train / commercial-tier** key. | Already present; keep it. |
| `CHANGELOG_APP_ID` | **variable** | GitHub App id used to push generated changesets / PR-number stamps back to branches. | Optional (recommended) |
| `CHANGELOG_APP_PRIVATE_KEY` | secret | Private key for that App. | Optional (recommended) |
| `RELEASE_GITHUB_TOKEN` | secret | Elevated token for `changesets/action` to open the Version PR / create GitHub Releases. Falls back to the built-in `GITHUB_TOKEN`. | Optional |
| `NPM_TOKEN` | secret | **Bootstrap only** (Part 1). Delete after. | Temporary |

> Security note: `ANTHROPIC_API_KEY` is only ever exposed to **PR-tier** jobs
> (`ai-changeset.yml`), never to the release job. The release job has no LLM and
> no npm token — keep it that way.

### 4c. (Recommended) GitHub App for automated commits

`ai-changeset.yml` (and `stamp-pr-number.yml`) push generated changesets / stamps
back to branches. They prefer a **GitHub App** token (a bypass-capable, auditable
actor) and otherwise fall back to the built-in token.

1. Create a GitHub App (Settings → Developer settings → GitHub Apps → New):
   - **Repository permissions:** `Contents: Read & write`, `Pull requests: Read &
     write`.
   - No webhook needed.
2. **Install** it on `crs48/xNet`.
3. Set the repo **variable** `CHANGELOG_APP_ID` and the **secret**
   `CHANGELOG_APP_PRIVATE_KEY` (the App's generated `.pem`).
4. If you protect `main` with a ruleset (4d), add this App as a **bypass actor**
   so its `[skip ci]` commits can land. (The `ai-changeset` job only pushes to PR
   **head** branches, which aren't protected, so this mainly matters for
   `stamp-pr-number.yml` writing to `main`.)

Without the App, the AI-changeset backstop still works on internal PRs (the
default token can push the unprotected head branch); it just degrades to a
comment on fork PRs.

### 4d. Branch protection / required checks (recommended)

Protect `main` (Settings → Rules → Rulesets) and require these checks (they're
the ones this PR pipeline produces):

- [ ] `lint` (includes `pnpm check:publish-closure` — the dependency-closure
      guard that prevents the un-installable-tarball bug).
- [ ] `typecheck`
- [ ] `test (1/3)`, `test (2/3)`, `test (3/3)`
- [ ] `changelog-section`

Add the GitHub App (4c) as a bypass actor for the automated `[skip ci]` commits.

### 4e. (Optional) Protected Environment gate

For an extra human gate on the *publish itself*: create a GitHub Environment
(e.g. `npm`) with a required reviewer, reference it in the publish job of
`npm-release.yml` (`environment: npm`), and put that same environment name in
each package's npm trusted-publisher config. The publish then waits for an
approval. Optional — the Version-PR merge already gates releases.

---

## Part 5 — Finish the currently-pending release

1. Complete **Part 1** (bootstrap the 6 packages).
2. Complete **Part 2** (trusted publishers for those 6).
3. **Merge the open Version PR** `chore(release): version packages`. The release
   publishes: fixed core → `0.0.3`, independent leaves → `0.0.2`/`0.0.3`, all with
   provenance.
4. Do **Part 3** (revoke token, disallow token publishing).

---

## Part 6 — Steady-state: how you release from now on

You rarely touch any of the above again. Per change:

1. Open a PR that changes one or more publishable packages.
2. A changeset gets added one of three ways:
   - an agent runs `/changeset` (the `Stop` hook enforces it),
   - you run `pnpm changeset` yourself, or
   - the `ai-changeset` CI backstop generates one from your conventional commits
     and commits it to the PR branch.
3. Merge the PR → the **Version PR** opens/updates automatically.
4. Review the Version PR (it shows every bump + the generated changelog) and
   **merge it** when you want to ship.
5. Packages publish to npm via OIDC with provenance.

Bump rules (from the diff, not just the commit prefix): removed/renamed export or
changed protocol/hash/wire contract = **major**; new backward-compatible feature
= **minor**; fix/perf/internal = **patch**. Pre-1.0 you may treat `BREAKING` as a
minor — decide and note it.

**Adding a brand-new package later?** It needs the same one-time bootstrap
(Part 1) because OIDC can't create it. Also: set `private:false`, add
`files:["dist","README.md","LICENSE"]`, a `LICENSE`, `publishConfig` with
`provenance`, ensure `exports`/`main`/`types` point at `./dist`, remove it from
`.changeset/config.json` `ignore`, and run `pnpm check:publish-closure`.

---

## Security checklist (sign-off)

- [ ] Bootstrap `NPM_TOKEN` revoked + secret deleted after first publish.
- [ ] Per-package "disallow tokens / require trusted publisher" enabled.
- [ ] 2FA enabled (org-wide if applicable).
- [ ] Provenance badge visible on published packages.
- [ ] Release job has **no** npm token and **no** Anthropic key; only `id-token`.
- [ ] `ANTHROPIC_API_KEY` is a no-train tier key, PR-jobs only.
- [ ] GitHub App key stored as a secret; App scoped to Contents + PRs only.
- [ ] `main` ruleset requires `lint`/`typecheck`/`test`/`changelog-section`.

## Validation

After the first full release:

```bash
# every package resolves at its new version with no E404
for p in core crypto identity sync sqlite storage data data-bridge history \
         plugins react abuse cli runtime trust slack-compat billing devkit; do
  echo "@xnetjs/$p $(npm view @xnetjs/$p version)"
done

# clean-room install proves the dependency closure is intact
mkdir /tmp/xnet-smoke && cd /tmp/xnet-smoke && npm init -y >/dev/null
npm i @xnetjs/plugins@latest @xnetjs/react@latest @xnetjs/cli@latest
node -e "require('@xnetjs/plugins'); console.log('ok')"
```

- [ ] All 18 packages report a version (no `E404`).
- [ ] The npm package pages show the **provenance** badge.
- [ ] The clean-room install succeeds (no missing `@xnetjs/*` dependency).
- [ ] `pnpm check:publish-closure` is green in CI.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `E404 ... PUT .../@xnetjs/<name>` on publish | OIDC can't first-publish a brand-new package | Bootstrap it with a token (Part 1) |
| `EUSAGE Automatic provenance generation not supported for provider: null` | publishing **locally** with `provenance:true` — provenance needs CI/OIDC, and `publishConfig` overrides `NPM_CONFIG_PROVENANCE` | Temporarily strip `provenance` from the 6 `publishConfig`s (the loop in Part 1b), publish, `git checkout --` to restore; provenance attaches on the next OIDC release |
| `Failed to parse data from GitHub … Premature close` during `version` | transient GitHub GraphQL hiccup in `@changesets/changelog-github` | Re-run the failed `npm Release` run (`gh run rerun --failed`) |
| Version PR never opens | Actions can't create PRs | Enable "Allow GitHub Actions to create and approve pull requests" (Part 4a) |
| `No changesets found … publishing unpublished packages` then `E404` | a package is config-publishable but unpublished and no changeset exists | Bootstrap the package, or add a changeset; don't leave config-publishable packages unpublished |
| A published package 404s on `npm install` | it depends on an unpublished `@xnetjs/*` package | `pnpm check:publish-closure` catches this in CI — publish/inline/demote the dep |
| Provenance badge missing | job lacked `id-token: write` or ran from the wrong workflow file | Confirm `id-token: write` and that the trusted-publisher workflow filename matches `npm-release.yml` |
