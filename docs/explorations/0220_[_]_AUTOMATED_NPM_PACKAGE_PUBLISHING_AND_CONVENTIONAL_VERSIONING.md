# Automated npm Package Publishing & Conventional-Commit Versioning

## Problem Statement

We want every `@xnetjs/*` package to publish to npm automatically when a change
merges to `main` — not just `@xnetjs/react`, but the whole core chain
(`@xnetjs/data`, `@xnetjs/crypto`, `@xnetjs/core`, …). Version bumps should be
driven by our existing **Conventional Commits** convention so that `feat:` →
minor, `fix:` → patch, and a breaking change → major are computed mechanically,
and each release should ship **good release notes**. The ask, as phrased, is:
"set up automated npm publication in CI/CD," "add the automatic versioning stuff
to the GitHub workflow," and "integrate this with our conventional commit
syntax."

## Executive Summary

**The headline finding: most of this already exists and is live.** Contrary to
the framing ("right now we already have `@xnetjs/react` publishing"), the repo
already has a complete, OIDC-secured, multi-package release pipeline built on
[Changesets](https://github.com/changesets/changesets):

- [`.github/workflows/npm-release.yml`](.github/workflows/npm-release.yml) runs
  `changesets/action@v1` on every push to `main`.
- [`.changeset/config.json`](.changeset/config.json) defines a **`fixed`
  (lockstep) group of 12 packages** — `react`, `history`, `plugins`,
  `data-bridge`, `data`, `storage`, `sqlite`, `sync`, `abuse`, `identity`,
  `crypto`, `core` — all marked `"private": false` with
  `publishConfig.provenance: true`.
- **12 packages have already shipped `@0.0.2`** to npm (git tags
  `@xnetjs/core@0.0.2` … `@xnetjs/react@0.0.2`, `@xnetjs/cli@0.0.2`), and each
  has a generated `CHANGELOG.md`.
- Publishing already uses **npm Trusted Publishing (OIDC)** — the most recent
  release commit is literally `2f4da8fc ci(release): remove npm token env for
  oidc publish`. No `NPM_TOKEN` lives in the repo.
- Conventional Commits are already **enforced** via commitlint
  ([`commitlint.config.cjs`](commitlint.config.cjs) +
  [`.husky/commit-msg`](.husky/commit-msg)).
- Operator docs already exist:
  [`docs/npm-release-quickstart.md`](docs/npm-release-quickstart.md) and
  [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md).

So this exploration is **not** a greenfield build. It is: (1) correcting the
mental model of what's already shipping, and (2) closing the **four real gaps**
that remain.

**The four real gaps:**

1. **Conventional commits do _not_ drive version bumps yet.** Changesets is
   _decoupled_ from commit messages by design — it needs a hand-written
   `.changeset/*.md` file per change. There are currently **zero** changeset
   files in the repo. So today, a `feat:` merged to `main` bumps **nothing**
   unless a human ran `pnpm changeset`. This is the actual integration the
   request is about.
2. **Release notes are thin.** The config uses the default
   `@changesets/cli/changelog` generator, which emits only the changeset
   summary and a dependency list — no PR links, no author credit, no commit
   links.
3. **The `fixed` lockstep group is a strong, unrevisited default.** Every one
   of the 12 packages bumps to the _same_ version on every release, even when
   untouched. That may not be what we want long-term.
4. **Config/reality drift bugs.** `@xnetjs/abuse` is in the `fixed` group but
   is stuck at `0.0.1` with no tag (never published); `@xnetjs/cli` _is_
   published but is **not** in the `fixed` group. The next release will try to
   force-bump and first-publish `abuse`, which needs an OIDC trusted publisher
   configured or it will fail mid-release.

**Recommendation (preview):** _Keep Changesets + OIDC — do not rip out a working
system._ Add a **conventional-commit → changeset generator** step so commits
drive bumps, upgrade to **`@changesets/changelog-github`** for rich notes,
install the **Changeset bot** as a PR guard, fix the `abuse`/`cli` drift, and
make a deliberate decision on `fixed` (lockstep) vs independent versioning. A
migration to release-please or semantic-release is possible but throws away
working infrastructure for marginal benefit.

## Current State In The Repository

### The release workflow (already exists)

[`.github/workflows/npm-release.yml`](.github/workflows/npm-release.yml):

```yaml
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
  id-token: write          # ← OIDC: the key to token-less publishing
jobs:
  release:
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: ./.github/actions/setup       # pnpm 10.30.3 + Node, frozen install
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'   # writes .npmrc for auth context
      - uses: changesets/action@v1
        with:
          commitMode: github-api
          version: pnpm version-packages    # = changeset version
          publish: pnpm release             # = pnpm build && changeset publish
          title: 'chore(release): version packages'
          commit: 'chore(release): version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
```

Notably there is **no `NODE_AUTH_TOKEN` / `NPM_TOKEN`** anywhere — the
`id-token: write` permission + `provenance: true` in each package means
`npm publish` (invoked by `changeset publish`) authenticates via OIDC trusted
publishing. The git history confirms the deliberate migration:

```
2f4da8fc ci(release): remove npm token env for oidc publish
1db75b95 ci(release): use npm token for node auth
feb4fd35 ci(release): pass npm token to changesets publish
5caa4fd9 fix(ci): use github-api mode for changesets commits
```

Root scripts in [`package.json`](package.json):

```jsonc
"changeset":         "changeset",
"version-packages":  "changeset version",
"release":           "pnpm build && changeset publish"
```

### The changesets config (already exists)

[`.changeset/config.json`](.changeset/config.json):

```jsonc
{
  "changelog": "@changesets/cli/changelog",   // ← thin default (gap #2)
  "commit": false,
  "fixed": [[                                  // ← lockstep group (gap #3)
    "@xnetjs/react", "@xnetjs/history", "@xnetjs/plugins", "@xnetjs/data-bridge",
    "@xnetjs/data", "@xnetjs/storage", "@xnetjs/sqlite", "@xnetjs/sync",
    "@xnetjs/abuse", "@xnetjs/identity", "@xnetjs/crypto", "@xnetjs/core"
  ]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@xnetjs/canvas", "@xnetjs/devtools", "@xnetjs/editor", "@xnetjs/formula",
    "@xnetjs/hub", "@xnetjs/network", "@xnetjs/query", "@xnetjs/sdk",
    "@xnetjs/telemetry", "@xnetjs/ui", "@xnetjs/vectors", "@xnetjs/views",
    "@xnetjs/e2e-tests", "@xnetjs/integration-tests",
    "site", "xnet-desktop", "xnet-mobile", "xnet-web"
  ]
}
```

### What's actually published vs. what's configured

| Package | In `fixed`? | `private` | `version` | npm tag exists? | Notes |
|---|---|---|---|---|---|
| `@xnetjs/core` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/crypto` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/identity` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/sync` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/storage` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/sqlite` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/data` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/data-bridge` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/history` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/plugins` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/react` | ✅ | false | 0.0.2 | ✅ | clean |
| `@xnetjs/abuse` | ✅ | false | **0.0.1** | ❌ | **drift: in group, never published** |
| `@xnetjs/cli` | ❌ | false | 0.0.2 | ✅ | **published, but not in `fixed`** |

So **12 packages already auto-publish**. The request's premise (only `react`
publishes; let's add `data` and `crypto`) is already satisfied — `data` and
`crypto` ship today. The two anomalies (`abuse`, `cli`) are gap #4.

A reassuring check: **no published package depends on an `ignore`d package**.
The 12-package closure is dependency-complete (e.g. `@xnetjs/data` → `core`,
`crypto`, `identity`, `sqlite`, `storage`, `sync` — all published), so npm
installs won't break on a missing `workspace:*` dependency. `pnpm publish`
rewrites `workspace:*` to the concrete version at pack time.

### Conventional Commits are enforced but unused for versioning

[`commitlint.config.cjs`](commitlint.config.cjs) is
`{ extends: ['@commitlint/config-conventional'] }`, wired through
[`.husky/commit-msg`](.husky/commit-msg) (`pnpm commitlint --edit`). So commit
_format_ is validated — but nothing reads those commits to compute a semver
bump. That bridge is the missing piece.

### Two different "changelogs" — don't conflate them

This repo has **two** changelog systems, and the request's "good release notes"
could mean either:

1. **Product changelog** — user-facing, lives in
   `site/src/data/changelog/*.json`, gated by the required
   [`changelog-check.yml`](.github/workflows/changelog-check.yml)
   `changelog-section` check (exploration 0197), with PR-number stamping
   (explorations 0202/0203). This is "what shipped in the app."
2. **Per-package `CHANGELOG.md`** — consumer-facing, generated by Changesets
   in each `packages/*/CHANGELOG.md`. This is "what changed in this npm
   release." Example today
   ([`packages/react/CHANGELOG.md`](packages/react/CHANGELOG.md)):

   ```markdown
   ## 0.0.2
   ### Patch Changes
   - cd2a564: Set up automated npm publishing via Changesets…
   - Updated dependencies [cd2a564]
     - @xnetjs/data-bridge@0.0.2
     - …
   ```

Gap #2 is specifically about making system #2 richer. The two systems should
stay separate; this exploration only touches #2.

### Current end-to-end flow

```mermaid
flowchart TD
    A[Developer opens PR] --> B{Ran pnpm changeset?}
    B -- "No (the norm today)" --> C[No .changeset/*.md]
    B -- "Yes (manual)" --> D[.changeset/abcd.md committed]
    C --> E[Merge to main]
    D --> E
    E --> F[npm-release.yml: changesets/action]
    F --> G{Pending changesets?}
    G -- No --> H[No-op: nothing to release]
    G -- Yes --> I[Open/update 'version packages' PR]
    I --> J[Human merges version PR]
    J --> K[changeset publish via OIDC]
    K --> L[(npm: @xnetjs/* @ new version + provenance)]
    style C fill:#fde8e8,stroke:#e02424
    style H fill:#fde8e8,stroke:#e02424
```

The red path is the trap: because changesets are manual and rarely created, the
common outcome of a merge is **"nothing to release."** Conventional-commit
integration converts the red path into the green one automatically.

## External Research

### npm Trusted Publishing (OIDC) — GA, and we're already on it

npm Trusted Publishing with OIDC went **generally available on 2025-07-31**
([GitHub Changelog](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)).
Key facts relevant to us:

- **No tokens.** Publish authenticates by exchanging a GitHub OIDC token; no
  `NPM_TOKEN` to store, rotate, or leak.
- **Requires npm CLI ≥ 11.5.1.** Our workflow pins Node 24, which ships a new
  enough npm, but pinning `npm install -g npm@latest` in the release job is a
  cheap insurance policy
  ([npm docs](https://docs.npmjs.com/trusted-publishers/)).
- **Provenance is automatic** under trusted publishing; `publishConfig.provenance: true`
  (already set on all 12 packages) makes the green "provenance" badge appear.
- **Configured per package, in the npm UI**, under each package's
  Settings → Trusted Publisher: org/user, repo, **workflow filename**, optional
  **environment**
  ([philna.sh](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)).
- **Bootstrapping caveat:** OIDC config can only be added to a package that
  **already exists on npm**. The 12 shipped packages are bootstrapped; any
  brand-new package needs a first publish (token or one-off manual) _or_ relies
  on the first OIDC publish creating the record — our quickstart claims the
  latter works, which matches npm's "first publish creates the package"
  behavior for scoped public packages from a configured trusted publisher.

### Release-automation tools compared

The three contenders for "commits → versions → npm," per
[Oleksii Popov's guide](https://oleksiipopov.com/blog/npm-release-automation/)
and [Brian Schiller](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/):

| Dimension | **Changesets** (current) | **release-please** (Google) | **semantic-release** |
|---|---|---|---|
| Bump source | Hand-written changeset files | Conventional Commits | Conventional Commits |
| Monorepo | First-class (built for it) | Good (`linked-versions`, manifest mode) | Weak; needs plugins/`semantic-release-monorepo` |
| Release gate | Version PR (review before publish) | Release PR (review before publish) | None — publishes on every qualifying merge |
| Notes | Per-package `CHANGELOG.md` | `CHANGELOG.md` from commits | `CHANGELOG.md` from commits |
| Intent capture | Explicit ("what does the consumer need to know?") | Inferred from commit subjects | Inferred from commit subjects |
| Migration cost from us | **None** | High (replace workflow + config + state) | High |

**Bridges that make Changesets commit-driven** (so we keep Changesets _and_ get
conventional-commit bumps):

- [`changeset-conventional-commits`](https://github.com/iamchathu/changeset-conventional-commits)
  — `pnpm dlx changeset-conventional-commits` reads commits since the last
  release and writes one `.changeset/*.md` per commit, mapping
  `feat:`→minor, `fix:`→patch, `BREAKING CHANGE`→major. Self-described stopgap
  until Changesets ships native support.
- [`@bob-obringer/conventional-changesets`](https://www.npmjs.com/package/@bob-obringer/conventional-changesets)
  — same idea, actively maintained alternative.
- [Changeset bot](https://github.com/changesets/bot) — comments on every PR
  "no changeset found," nudging contributors. Pairs well with either bridge as
  a safety net.
- [`@changesets/changelog-github`](https://github.com/changesets/changesets/tree/main/packages/changelog-github)
  — drop-in replacement for the `changelog` generator that adds PR links, commit
  links, and author credit to `CHANGELOG.md`.

The official changesets docs explicitly bless this composition in
[automating-changesets.md](https://github.com/changesets/changesets/blob/main/docs/automating-changesets.md).

## Key Findings

1. **The pipeline is built and proven** — 12 packages at `0.0.2`, OIDC,
   provenance, generated changelogs, operator docs. We are improving, not
   bootstrapping.
2. **The one true gap vs. the request is commit→bump automation.** Changesets
   is intentionally decoupled from commits; without a bridge, conventional
   commits never move versions. Today the steady-state result of a merge is
   "nothing to release."
3. **Release notes are functional but plain.** `@changesets/changelog-github`
   is a one-line config + token change that directly satisfies "good release
   notes with each release."
4. **`fixed` lockstep is a real product decision, not an accident.** It keeps
   versions aligned (easy mental model, like React's monorepo) at the cost of
   noisy version churn (a `core` patch republishes all 12). Worth an explicit
   yes/no now, before more consumers pin versions.
5. **Two drift bugs will bite the next release.** `@xnetjs/abuse` (in `fixed`,
   at `0.0.1`, never published) will be force-bumped to the group version and a
   **first-ever publish** attempted — which fails unless an OIDC trusted
   publisher is configured for it. `@xnetjs/cli` publishes outside the group;
   harmless but should be made intentional (independent versioning) and
   documented.
6. **Auth has no token fallback.** OIDC is great, but if OIDC ever fails (npm
   incident, CLI version regression), the release job has no `NPM_TOKEN`
   fallback. That's an acceptable, even preferable, posture — but it should be a
   conscious choice with a documented manual-publish escape hatch.

## Options And Tradeoffs

### Decision A — How do conventional commits drive bumps?

```mermaid
flowchart LR
    subgraph A1["A1: Manual changesets + bot (status quo+)"]
      direction TB
      a1[Dev runs pnpm changeset] --> a2[Bot nags if missing]
    end
    subgraph A2["A2: Auto-generate changesets from commits (RECOMMENDED)"]
      direction TB
      b1[CI runs changeset-conventional-commits] --> b2[Writes .changeset/*.md from feat/fix/BREAKING]
    end
    subgraph A3["A3: Migrate to release-please"]
      direction TB
      c1[Replace npm-release.yml] --> c2[Release PR from commits]
    end
    subgraph A4["A4: Migrate to semantic-release"]
      direction TB
      d1[Publish on every merge] --> d2[No review gate]
    end
```

- **A1 — Keep manual changesets, add the bot.** Lowest effort. Preserves the
  "explicit consumer intent" virtue (a `feat:` subject is for _us_; a changeset
  summary is for _consumers_). But it does **not** satisfy the request —
  versioning still isn't commit-driven, and humans keep forgetting.
- **A2 — Auto-generate changesets from conventional commits (recommended).**
  Add a CI step (or local script) running `changeset-conventional-commits`
  before `changeset version`. Commits now drive bumps; we keep Changesets'
  monorepo handling, the version-PR review gate, OIDC, and the existing docs.
  Risk: the generator is a community stopgap — pin the version and keep manual
  `pnpm changeset` available as an override for nuanced notes.
- **A3 — release-please.** Natively commit-driven with a clean Release PR and
  good monorepo support. But it _replaces_ a working system: new workflow, new
  manifest/config, new release-state file, and we'd re-learn its quirks. High
  cost for parity-plus.
- **A4 — semantic-release.** Fully hands-off, but **no review gate** (publishes
  on every qualifying merge) and weak monorepo story. Poor fit for a 12-package
  lockstep repo that currently values a human merge of the version PR.

### Decision B — Release-note generator

- **B1 — Keep `@changesets/cli/changelog`.** Zero work; notes stay plain.
- **B2 — `@changesets/changelog-github` (recommended).** PR/commit/author
  links. Needs a GitHub token at `version` time (we already pass
  `RELEASE_GITHUB_TOKEN`/`GITHUB_TOKEN`). One-line config swap.
- **B3 — Custom generator.** Could fold per-package notes into the product
  changelog. Overkill; keep the two changelog systems separate.

### Decision C — Versioning topology

```mermaid
flowchart TD
    F["fixed / lockstep (current)"] -->|"core patch"| FA["all 12 → same new version"]
    I["independent"] -->|"core patch"| IA["only core + its dependents bump"]
    L["linked"] -->|"hybrid"| LA["chosen set shares a line, others independent"]
```

- **C1 — Keep `fixed` lockstep.** Simple "everything is `0.x.y` together"
  story; great while pre-1.0 and APIs co-evolve. Cost: version churn and
  misleading diffs (a package republished with no real change).
- **C2 — Independent versioning.** Each package moves only when it (or a
  dependency) changes — accurate semver per package. Cost: consumers juggle
  divergent versions; more moving parts. Best _after_ 1.0 when packages
  stabilize at different rates.
- **C3 — `linked` (hybrid).** Keep a tight core (`core`/`crypto`/`data`…)
  linked, let leaf packages float. A reasonable middle path.

**Pre-1.0 recommendation: stay `fixed` now, revisit at 1.0.** But fix the
membership (add `abuse` correctly or remove it; decide `cli` in/out).

### Decision D — Auth posture

- **D1 — OIDC only (current, recommended).** No secrets; provenance for free.
  Add a **documented manual escape hatch** for OIDC outages.
- **D2 — OIDC + `NPM_TOKEN` fallback.** Re-introduces a long-lived secret —
  the exact thing we just removed. Only if release reliability becomes critical
  and OIDC proves flaky.

## Recommendation

**Keep the existing Changesets + OIDC pipeline. Make it commit-driven, richer,
and correct.** Concretely:

1. **A2 + Changeset bot** — auto-generate changesets from conventional commits,
   with the bot as a backstop and manual `pnpm changeset` retained for nuanced
   release notes.
2. **B2** — switch the changelog generator to `@changesets/changelog-github`.
3. **C1 (for now)** — stay lockstep pre-1.0, but **fix the drift**: get
   `@xnetjs/abuse` either correctly bootstrapped+OIDC-configured or removed from
   `fixed`; declare `@xnetjs/cli` intentionally independent and document it.
4. **D1** — OIDC only, plus a documented manual-publish runbook entry for
   outages, and pin `npm@latest` in the release job.
5. **Harden** with an optional protected GitHub **Environment** on the publish
   job so a human (or required reviewer) gates the actual `npm publish`, and so
   the trusted-publisher config can bind to that environment name.

This satisfies the request — automatic publishing for all core packages
(already true), commit-driven semver (new), and good release notes (new) —
while preserving a system that already works and is already documented.

### Proposed flow

```mermaid
sequenceDiagram
    actor Dev
    participant PR as Feature PR
    participant Bot as Changeset bot
    participant Main as main
    participant WF as npm-release.yml
    participant Gen as changeset-conventional-commits
    participant CS as changesets/action
    participant NPM as npm (OIDC)

    Dev->>PR: commits (feat:/fix:/BREAKING)
    Bot-->>PR: "no changeset?" comment (backstop)
    Dev->>Main: merge (squash keeps conventional subject)
    Main->>WF: push event
    WF->>Gen: generate .changeset/*.md from commits
    Gen-->>WF: feat→minor, fix→patch, BREAKING→major
    WF->>CS: version (changelog-github notes) / publish
    alt pending bumps
        CS-->>Main: open/update "version packages" PR
        Dev->>Main: merge version PR
        Main->>WF: push event
        WF->>CS: changeset publish
        CS->>NPM: publish + provenance via OIDC (id-token)
        NPM-->>Dev: @xnetjs/* @ new versions
    else nothing to release
        CS-->>WF: no-op
    end
```

### Bump-computation semantics

```mermaid
stateDiagram-v2
    [*] --> Inspect
    Inspect --> Major: footer "BREAKING CHANGE" or "type!:"
    Inspect --> Minor: "feat:"
    Inspect --> Patch: "fix:" / "perf:" / "refactor:"
    Inspect --> None: "chore:" / "docs:" / "test:" / "ci:"
    Major --> [*]
    Minor --> [*]
    Patch --> [*]
    None --> [*]
    note right of None
      Operational commits create no changeset.
      Use pnpm changeset --empty to force a
      no-op release entry when needed.
    end note
```

## Example Code

### 1. Richer release notes — `.changeset/config.json`

```jsonc
{
  // was: "@changesets/cli/changelog"
  "changelog": [
    "@changesets/changelog-github",
    { "repo": "crs48/xNet" }
  ],
  "commit": false,
  "fixed": [[ /* …unchanged for now… */ ]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [ /* …unchanged… */ ]
}
```

```bash
pnpm add -Dw @changesets/changelog-github
```

`@changesets/changelog-github` resolves PR/author from the commit at
`version` time using `GITHUB_TOKEN` — already present in the workflow env.

### 2. Conventional-commit → changeset generation in CI

Add a generation step **before** `changeset version`. Two wiring options:

**Option A — inside the workflow, before `changesets/action`:**

```yaml
# .github/workflows/npm-release.yml (excerpt)
      - uses: ./.github/actions/setup
        with: { node-version: '24' }

      - name: Ensure npm supports trusted publishing
        run: npm install -g npm@latest

      - name: Generate changesets from conventional commits
        run: pnpm dlx changeset-conventional-commits

      - name: Commit generated changesets
        run: |
          if [ -n "$(git status --porcelain .changeset)" ]; then
            git config user.name  "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add .changeset
            git commit -m "chore(release): generate changesets from commits"
          fi

      - uses: changesets/action@v1
        with:
          commitMode: github-api
          version: pnpm version-packages
          publish: pnpm release
          title: 'chore(release): version packages'
          commit: 'chore(release): version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
```

**Option B — a root script (keeps logic in repo, testable locally):**

```jsonc
// package.json
"scripts": {
  "changeset:from-commits": "changeset-conventional-commits",
  "version-packages": "changeset version"
}
```

Then call `pnpm changeset:from-commits` in the workflow step. Pin the tool to
an exact version in `devDependencies` rather than `dlx` once validated.

### 3. Changeset bot (PR backstop)

Install the [Changeset bot GitHub App](https://github.com/apps/changeset-bot)
on `crs48/xNet`. No code; it comments on PRs lacking a changeset. With Option A
active, most PRs won't need a manual changeset — the bot is the safety net for
the cases where a human wants to write richer consumer notes than the commit
subject.

### 4. Adding a new package to the release set

Per [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md), a package
joins the set when it:

```jsonc
// packages/<new>/package.json
{
  "private": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md", "LICENSE"],
  "license": "MIT",
  "publishConfig": { "access": "public", "provenance": true },
  "repository": { "type": "git", "url": "git+https://github.com/crs48/xNet.git" }
}
```

…is removed from `ignore` (and added to `fixed` only if it should version in
lockstep), has an OIDC trusted publisher configured on npm, and passes
`pnpm publish --dry-run`.

### 5. Fixing the `abuse` drift

```bash
# Verify what npm thinks exists
npm view @xnetjs/abuse version    # → 404 today (never published)

# Decide: include abuse in the lockstep group?
#  YES → configure its OIDC trusted publisher BEFORE the next release,
#        so the force-bump-to-group-version first publish succeeds.
#  NO  → remove "@xnetjs/abuse" from `fixed` and add it to `ignore`
#        until its packaging contract is ready.
```

## Risks And Open Questions

- **`changeset-conventional-commits` is a community stopgap.** Pin an exact
  version; smoke-test that squash-merge commit subjects (the conventional line)
  are what it reads. If a squash drops the conventional prefix, bumps silently
  vanish. Mitigation: enforce conventional **PR titles** too, and/or keep the
  bot backstop.
- **Squash vs. merge commits.** Our bump accuracy depends on the conventional
  subject surviving to `main`. The repo squash-merges in places and
  merge-commits in others (memory notes squash is disabled on some PRs). The
  generator must read whatever lands on `main`. Validate against our actual
  merge strategy before trusting it.
- **`abuse` first-publish in a `fixed` group.** A `fixed` member at a lower
  version is a known Changesets footgun — `version` will pull it up to the
  group version and publish it. Without OIDC pre-configured, the whole release
  job fails after some packages have already published (partial release).
  **Configure or remove `abuse` before the next release.**
- **OIDC has no fallback.** A npm/OIDC incident blocks all releases. Acceptable,
  but document a manual `npm publish --provenance` escape hatch (requires a
  short-lived granular token, used only in emergencies).
- **Provenance + `id-token`.** Provenance only attaches when the job has
  `id-token: write` (it does) and runs from the configured workflow file name.
  Renaming `npm-release.yml` silently breaks trusted publishing until the npm
  UI config is updated.
- **Double-versioning risk.** If both the auto-generator _and_ a human create a
  changeset for the same change, the bump is the max of the two — usually fine,
  but worth a note in the runbook.
- **Open question:** Should per-package `CHANGELOG.md` entries feed the product
  changelog (`site/src/data/changelog/*.json`), or stay fully separate? Default:
  separate. The product changelog is for app users; package changelogs are for
  npm consumers.
- **Open question:** 0.x semver. Pre-1.0, a "breaking" change is technically a
  minor under semver's 0.x rule. Decide whether `BREAKING CHANGE` should bump
  minor (spec-correct for 0.x) or major (clearer signal) while we're pre-1.0.

## Implementation Checklist

- [ ] Install `@changesets/changelog-github` and switch the `changelog` field
      in [`.changeset/config.json`](.changeset/config.json) to it with
      `{ "repo": "crs48/xNet" }`.
- [ ] Add `changeset-conventional-commits` (pinned) and a
      `changeset:from-commits` root script.
- [ ] Add the generation + auto-commit step to
      [`npm-release.yml`](.github/workflows/npm-release.yml) **before**
      `changesets/action`.
- [ ] Pin `npm install -g npm@latest` in the release job (OIDC ≥ 11.5.1).
- [ ] Install the [Changeset bot](https://github.com/apps/changeset-bot) on
      `crs48/xNet`.
- [ ] Resolve `@xnetjs/abuse`: either configure its npm OIDC trusted publisher
      and let it first-publish, or remove it from `fixed` → `ignore`.
- [ ] Declare `@xnetjs/cli` topology explicitly (independent) and note it in
      [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md).
- [ ] (Optional) Add a protected GitHub Environment to the publish job and bind
      trusted-publisher configs to that environment name.
- [ ] Update [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md) and
      [`docs/npm-release-quickstart.md`](docs/npm-release-quickstart.md) for the
      new commit-driven flow and the manual-publish escape hatch.
- [ ] Decide the pre-1.0 `BREAKING CHANGE` → minor-vs-major policy and encode it
      (config or runbook).

## Validation Checklist

- [ ] On a test branch, land a `fix:` commit and confirm CI generates a
      `patch` changeset; a `feat:` generates `minor`; a `feat!:` /
      `BREAKING CHANGE` generates `major`.
- [ ] `pnpm changeset status` lists the expected bumps locally.
- [ ] `pnpm -r --filter "@xnetjs/*" publish --dry-run --access public
      --report-summary --no-git-checks` packs all 12 packages with correct
      `dist/` contents and no `workspace:*` leakage.
- [ ] The generated "version packages" PR shows `@changesets/changelog-github`
      notes with PR links and author credit.
- [ ] After merging the version PR, the `npm Release` workflow is green and npm
      shows new versions **with the provenance badge**.
- [ ] `npm view @xnetjs/abuse version` returns a real version (drift resolved).
- [ ] A clean-project smoke test installs and imports a published package:
      `npm i @xnetjs/data@latest && node -e "require('@xnetjs/data')"`.
- [ ] Force an OIDC-fail dry run (e.g. wrong workflow name in a throwaway test)
      and confirm the documented manual escape hatch works.

## References

- [`.github/workflows/npm-release.yml`](.github/workflows/npm-release.yml) — current release workflow
- [`.changeset/config.json`](.changeset/config.json) — changesets config (`fixed`, `ignore`, changelog)
- [`docs/npm-release-quickstart.md`](docs/npm-release-quickstart.md) / [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md) — existing operator docs
- [`commitlint.config.cjs`](commitlint.config.cjs) + [`.husky/commit-msg`](.husky/commit-msg) — conventional-commit enforcement
- [`.github/workflows/changelog-check.yml`](.github/workflows/changelog-check.yml) — product changelog gate (distinct system)
- [npm Trusted Publishing GA announcement](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)
- [npm Trusted Publishers docs](https://docs.npmjs.com/trusted-publishers/) / [provenance docs](https://docs.npmjs.com/generating-provenance-statements/)
- [Things you need to do for npm trusted publishing](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [changesets/changesets](https://github.com/changesets/changesets) · [automating-changesets.md](https://github.com/changesets/changesets/blob/main/docs/automating-changesets.md) · [changesets/action](https://github.com/changesets/action) · [changesets/bot](https://github.com/changesets/bot)
- [changeset-conventional-commits](https://github.com/iamchathu/changeset-conventional-commits) · [@bob-obringer/conventional-changesets](https://www.npmjs.com/package/@bob-obringer/conventional-changesets)
- [The Ultimate Guide to NPM Release Automation (Changesets vs release-please vs semantic-release)](https://oleksiipopov.com/blog/npm-release-automation/)
- [Changesets vs Semantic Release — Brian Schiller](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/)
- [Automated Releases with Conventional Commits and release-please](https://devopsil.com/articles/2026-03-21-semantic-versioning-automated-releases)
