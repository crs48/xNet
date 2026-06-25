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
   untouched — so a breaking change to `core` majors all of them. For xNet's
   tightly-coupled _protocol core_ that is actually the right call (it's the
   Angular/Babel pattern), but it should **not** be applied blanket-wide to
   loosely-coupled feature packages. See
   [Decision C](#decision-c--versioning-topology-for-interdependent-packages)
   for the full best-practice treatment and a two-tier model.
4. **Config/reality drift bugs.** `@xnetjs/abuse` is in the `fixed` group but
   is stuck at `0.0.1` with no tag (never published); `@xnetjs/cli` _is_
   published but is **not** in the `fixed` group. The next release will try to
   force-bump and first-publish `abuse`, which needs an OIDC trusted publisher
   configured or it will fail mid-release.

Three follow-on analyses extend this (Decisions C, E, F), and one surfaced a
**latent release-blocker**:

5. **Versioning topology** should be two-tier — lockstep for the coupled
   protocol core, independent for the periphery — not "sync everything." See
   [Decision C](#decision-c--versioning-topology-for-interdependent-packages).
6. **AI can _complement_ changeset generation** but must never replace the
   deterministic floor or sit on the publish critical path. See
   [Decision E](#decision-e--ai-assisted-changeset-generation).
7. **We should _not_ publish everything** — curate an OSS-licensed,
   dependency-closed subset (5 publish-now, 16 when-ready, 12 keep-private). See
   [Decision F](#decision-f--which-packages-should-we-publish-publish-everything-vs-curate).
8. **🚨 Latent release-blocker (highest priority).** In HEAD, three published
   packages gained `workspace:*` runtime deps on **private, unpublished**
   packages — `react→billing`, `plugins→{trust,slack-compat}`, `cli→devkit`. The
   live `@0.0.2` tarballs are fine (these deps were added after that tag), but
   the **next** `changeset publish` will **error and block the release** (a
   non-ignored private package can't be in a published closure). See
   [the closure bug](#the-broken-install-dependency-closure-bug).

**Recommendation (preview):** _Keep Changesets + OIDC — do not rip out a working
system._ Add a **conventional-commit → changeset generator** (optionally
AI-augmented, advisory-only) so commits drive bumps, upgrade to
**`@changesets/changelog-github`** for rich notes, install the **Changeset bot**
as a PR guard, adopt a **two-tier versioning topology**, **curate** the publish
set rather than publishing everything, and — first — **fix the closure
release-blocker** and add a CI closure guard. A migration to release-please or
semantic-release is possible but throws away working infrastructure for marginal
benefit.

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
4. **Versioning topology should be two-tier, and is the most consequential
   decision.** Best practice for interdependent packages is _not_ "sync all
   versions" nor "everything independent" — it's **lockstep for the genuinely
   coupled compatibility set, independent for the loosely-coupled periphery**
   (Angular/Babel lockstep their cores; Nx/Lerna keep libraries independent).
   For xNet that means: keep the protocol core (`core`→`react` chain) in the
   `fixed` group (a `core` breaking change majoring them all is correct there),
   but version `cli` and future feature packages (`charts`, `maps`, `crm`, …)
   independently so they don't inherit unrelated majors. The current config is
   accidentally close to this; make it principled. Full analysis in
   [Decision C](#decision-c--versioning-topology-for-interdependent-packages).
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

### Decision C — Versioning topology for interdependent packages

This is the most consequential decision, and the one worth getting right
deliberately: **when packages depend on each other, do you keep all their
version numbers in sync, or let each move on its own?** The instinct "we
changed `core`, so bump everything" is intuitive but is, by itself, an
anti-pattern (version inflation). The nuanced best practice is below.

#### The precise mechanics (Changesets terms)

There are three distinct topologies, and the difference between the first two
is subtle but decides everything:

| Topology | When a member changes | Untouched members | Version numbers |
|---|---|---|---|
| **`fixed`** (current) | All members bump **and republish** | **Republished too** (no-op diffs) | Always **identical** across the set |
| **`linked`** | Only changed members + their dependents bump | **Left alone** (not republished) | Snap to the **highest** in the set _when they do move_ — so they can **drift apart** over time |
| **independent** | Only the changed package + dependents bump | Left alone | Each is **its own** number; unrelated |

The trap people fall into: assuming `linked` means "always the same number." It
doesn't. `linked` only aligns the packages that happen to release together;
untouched ones stay behind, so a `linked` set ends up with _mixed_ numbers
(`core@3.2.1`, `data@3.2.1`, `charts@3.0.0`). If your goal is the strong "every
package in this set carries the identical version → guaranteed compatible"
guarantee, only **`fixed`** delivers it.
([fixed-packages.md](https://github.com/changesets/changesets/blob/main/docs/fixed-packages.md),
[linked-packages.md](https://github.com/changesets/changesets/blob/main/docs/linked-packages.md))

#### Does a breaking change to one package bump them all? — the direct answer

```mermaid
flowchart TD
    BC["BREAKING change to @xnetjs/core"] --> Q{Is the dependent in<br/>core's lockstep set?}
    Q -- "Yes (fixed)" --> Y["Dependent gets a MAJOR too<br/>and republishes — even if its<br/>own API is unchanged"]
    Q -- "No (independent)" --> Z{Does core's change leak<br/>through the dependent's<br/>PUBLIC API?}
    Z -- "Yes" --> ZA["Dependent gets a MAJOR<br/>(real breaking change for its consumers)"]
    Z -- "No" --> ZB["Dependent gets the MINIMUM bump:<br/>usually a PATCH via<br/>updateInternalDependencies"]
    style Y fill:#fef3c7,stroke:#d97706
    style ZA fill:#fee2e2,stroke:#dc2626
    style ZB fill:#dcfce7,stroke:#16a34a
```

- **Under `fixed` (lockstep):** **Yes — every package majors and republishes**,
  including ones whose own code and API never changed. That's the deal you're
  buying: a uniform version line in exchange for honest per-package semver.
- **Under independent:** **No.** Changesets cascades the _minimum_ bump each
  dependent actually needs. A dependent that merely re-points its `workspace:*`
  range at the new `core` gets a **patch** (governed by
  `updateInternalDependencies`, currently `"patch"`). It only majors if the
  breaking change genuinely surfaces in _its own_ public API. This is "honest
  semver": a version bump on `@xnetjs/charts` means _charts_ changed.

#### Prior art — who does what, and why

| Project | Strategy | Why it fits them |
|---|---|---|
| **Angular** (`@angular/*`) | Lockstep `fixed` | One framework split into packages; "use the v18 line together." Compatibility legibility > per-package precision. |
| **Babel** (`@babel/*`) | Lockstep `fixed` | ~150 tightly-coupled plugins/helpers around one compiler core; always released together. |
| **Jest**, **Apollo**, **Storybook (core)** | Lockstep `fixed` | Coordinated release trains; a "Jest 30" is a set. |
| **React** (`react` + `react-dom`) | Lockstep for the _pair_ | Reconciler and renderer must match exactly. |
| **Nx libraries**, most Lerna-independent repos, smaller monorepos | **Independent** | Loosely-coupled libraries on different cadences; lockstep would inflate versions for no reason. Nx explicitly calls "lockstep is mandatory in a monorepo" a [myth](https://nx.dev/blog/monorepo-myths-debunked). |

The pattern: **lockstep is right for a genuinely coupled _compatibility set_;
independent is right for loosely-coupled libraries on their own cadence.** The
mistake is applying _either_ blanket-wide.

#### The best practice for xNet: a two-tier model

xNet is not one homogeneous set — it has a **tightly-coupled protocol core** and
a **loosely-coupled periphery**, so the right answer is _both_, partitioned:

```mermaid
flowchart TB
    subgraph CORE["fixed / lockstep — the protocol compatibility set"]
      direction LR
      core["@xnetjs/core"] --> crypto["@xnetjs/crypto"]
      crypto --> identity["@xnetjs/identity"]
      identity --> sync["@xnetjs/sync"]
      sync --> data["@xnetjs/data"]
      data --> react["@xnetjs/react"]
      data --> plugins["@xnetjs/plugins"]
    end
    subgraph EDGE["independent — feature & tool packages"]
      direction LR
      cli["@xnetjs/cli"]
      charts["@xnetjs/charts*"]
      maps["@xnetjs/maps*"]
      crm["@xnetjs/crm*"]
    end
    EDGE -. "depends on a published core range" .-> CORE
```

- **Tier 1 — the core/runtime chain → keep `fixed` (lockstep).** `core`,
  `crypto`, `identity`, `sync`, `sqlite`, `storage`, `data`, `data-bridge`,
  `history`, `plugins`, `react` implement **one wire protocol** (signed,
  hash-chained, LWW change log over schema nodes) and share schemas. They
  genuinely co-evolve — the repo's own history shows breaking protocol changes
  rippling across them in lockstep (e.g. the lamport-integer refactor touched
  56 files across packages). For a set like this, the "all the same number =
  trivially compatible" guarantee is worth more than per-package semver
  precision, and the churn cost is low because they almost always release
  together anyway. This is the Angular/Babel situation, and `fixed` is the
  correct tool — **not** `linked` (which would let the core's numbers drift and
  defeat the compatibility guarantee).
- **Tier 2 — leaf/feature/tool packages → independent.** `@xnetjs/cli` (already
  outside the group) and future feature packages (`charts`, `maps`, `crm`,
  `social`, `comms`, …) should **not** inherit the core's majors. They depend on
  a _published range_ of the core (e.g. `"@xnetjs/core": "^3"`) and version on
  their own cadence. A `core` major shouldn't drag `@xnetjs/charts` to a new
  major when charts' own API is unchanged.

So the answer to "should we keep _all_ our version numbers in sync?" is:
**only the ones that are actually coupled.** Sync the protocol core; let the
periphery float. The current config is _accidentally_ close to this (cli is
already independent) — the work is to make it **principled and explicit**, and
to stop pulling loosely-coupled packages into the lockstep group as the
catalog grows.

#### Escape valve: a compatibility-anchor meta-package

If Tier 1 ever moves to independent (e.g. post-1.0), the standard way to keep
consumers sane is an **umbrella meta-package** that pins a tested set of exact
versions — and `@xnetjs/sdk` already exists (currently `private`/ignored) and is
the natural home. `npm i @xnetjs/sdk@3.4.0` would transitively pin a known-good
core combination, giving you independent per-package semver _and_ a one-install
compatibility guarantee. This is how you get "the best of both" without
lockstep churn. Worth keeping in the back pocket; not needed pre-1.0.

#### When to revisit

Pre-1.0 (today), lockstep churn is cheap and the core's APIs co-move, so Tier 1
`fixed` is clearly right. The trigger to reconsider is **1.0 + diverging
cadence**: once individual core packages stabilize and start changing at very
different rates, re-evaluate Tier 1 → independent-plus-`@xnetjs/sdk`-anchor.
Record the trigger; don't pre-optimize for it now.

**Recommendation: `fixed` for the coupled core, independent for the periphery;
fix the membership (`abuse` in or out; `cli` explicitly independent); revisit
Tier 1 at 1.0.**

### Decision D — Auth posture

- **D1 — OIDC only (current, recommended).** No secrets; provenance for free.
  Add a **documented manual escape hatch** for OIDC outages.
- **D2 — OIDC + `NPM_TOKEN` fallback.** Re-introduces a long-lived secret —
  the exact thing we just removed. Only if release reliability becomes critical
  and OIDC proves flaky.

### Decision E — AI-assisted changeset generation

The deterministic `changeset-conventional-commits` bridge (Decision A) stays
authoritative on the publish critical path. The AI layer **complements** it,
never displaces it, doing two things the commit prefix cannot: (1) **draft a
high-quality, consumer-facing summary** by reading the real diff, and (2)
**suggest a bump level** by reading that diff to catch an unflagged breaking
change a `fix:`/`feat:` prefix understated — a removed/renamed export, a changed
signature, a protocol/hash-contract change like the `da83437e` lamport refactor.
Both AI outputs are **advisory**: they are materialized into a committed,
human-reviewable `.changeset/*.md` and confirmed at the `chore(release): version
packages` PR before anything publishes.

**Invariant, enforced in deterministic code (not the model):**
`final_bump = max(deterministic_floor, ai_bump)` per package. The AI may only
**raise** a bump or rewrite prose — never lower a bump, never invent a release
the commit floor didn't justify. The `fixed` 12-package core fan-out and the
`ignore` list are applied deterministically via `@changesets/write`, so the LLM
never authors YAML frontmatter and a core-package change always fans across all
12 lockstep packages.

**Primary path — agent-native.** Because xNet is overwhelmingly built by Claude
Code agents, the cheapest, highest-quality, most reliable changeset author is the
session that already wrote the code and understands _why_. Ship a `/changeset`
skill (sibling to [`.claude/skills/explore/`](.claude/skills/explore/), matching
the `/graphify` slash-command habit) that grounds the agent in
`git diff origin/main...HEAD` plus `turbo run typecheck --affected --dry-run=json`,
and a **Stop/SubagentStop hook** in a net-new `.claude/settings.json` that runs
`changeset status --since=main` and refuses to end a package-touching turn until
`.changeset/` covers every affected publishable `packages/*` (emitting
`changeset --empty` for docs/tooling-only work). A terse CLAUDE.md rule makes the
agent self-enforce, complementing commitlint. The agent reuses its own context —
no extra API call, no key.

**Backstop path — CI, suggest-only.** A net-new
`.github/workflows/ai-changeset.yml` on `pull_request: [opened, synchronize]`
(**never** `pull_request_target`) covers PRs no agent authored (humans,
Dependabot, web-UI edits). It runs the deterministic bridge first, then an AI
step that reads the diff, applies `max(floor, ai)`, and writes `.changeset/*.md`.
It commits back to the **PR HEAD branch** (reusing
[`stamp-pr-number.yml`](.github/workflows/stamp-pr-number.yml)'s GitHub App token
+ `[skip ci]` + rebase-retry machinery) and posts the inferred bump + a one-line
rationale as a PR comment so reviewers can contest the semver call. This job
holds `contents:write` + `pull-requests:write` **only** — never `id-token:write`,
never npm/OIDC secrets (the "Agents Rule of Two": untrusted input + secrets +
side effects, pick two). For fork PRs where it cannot push, it degrades to a
suggestion comment.

**Trust boundary (load-bearing).** This is the security crux of putting an LLM
near a pipeline that can publish. [`npm-release.yml`](.github/workflows/npm-release.yml)
is left exactly as-is: it is the _only_ job with `id-token:write`, runs
`changesets/action@v1` in two-step mode (`version` opens a Version PR; `publish`
fires only on a _later_ push to main after a human merges that PR), and never
invokes an LLM. Two human gates therefore sit between any AI-authored changeset
and an OIDC publish. The proven primitive already exists:
[`scripts/changelog/ai-release-notes.mjs`](scripts/changelog/ai-release-notes.mjs)
is a zero-dependency, **fail-open** Anthropic call (default `claude-haiku-4-5`)
already wired with `ANTHROPIC_API_KEY` in
[`electron-release.yml`](.github/workflows/electron-release.yml) — clone its
shape for changesets but feed it the diff. No new secret is needed, and the key
is only ever exposed to PR-tier jobs, never the release job.

```mermaid
flowchart TD
    subgraph PRIMARY["Primary — agent-native (no extra API call)"]
      A1["Claude Code agent edits packages/*"] --> A2["/changeset skill:<br/>reads diff + turbo --affected"]
      A2 --> A3["Stop hook blocks turn-end until<br/>.changeset covers affected pkgs"]
    end
    subgraph BACKSTOP["Backstop — CI suggest-only (pull_request, no OIDC)"]
      B1["Deterministic floor:<br/>changeset-conventional-commits"] --> B2["AI raises bump +<br/>drafts notes from diff"]
      B2 --> B3["final = max(floor, ai)"]
      B3 --> B4["commit .changeset to PR HEAD<br/>+ comment rationale"]
    end
    A3 --> M["Merge PR to main"]
    B4 --> M
    M --> V["changesets/action opens Version PR"]
    V --> H{"Human merges Version PR"}
    H --> P["npm publish via OIDC<br/>(NO LLM in this job)"]
    style P fill:#dcfce7,stroke:#16a34a
    style H fill:#fef3c7,stroke:#d97706
```

The recommended sequencing: build the deterministic floor + the agent-native
skill/hook + a `changeset status` coverage gate first; add the CI AI backstop
only once non-agent PRs prove a real coverage gap. The model is always advisory,
always behind two human gates, never holding publish credentials.

### Decision F — Which packages should we publish? (publish-everything vs curate)

**Decision: No. We do not publish all 46 packages — we curate a small,
deliberately-licensed, dependency-closed public subset and keep everything else
internal-by-default.**

"Publish everything" sounds like a cheap way to maximize reach, but it is the
wrong default on every axis, and the authoritative monorepo tooling agrees with
curating. Turborepo and Nx both make the _Internal Package_ the recommended
default and treat _publishable_ as the deliberate opt-in, because npm-grade
packaging carries the strictest requirements. Our own publishing tool,
Changesets, mechanically enforces that a publishable package's runtime closure
must itself be publishable — which is exactly the broken-install bug documented
below. And the economics are lopsidedly asymmetric: **staying unpublished is free
and fully reversible (you can always publish later); publishing is per-version
immutable and effectively irreversible** the moment a package gets any adoption
(npm blocks unpublish after 72h once there is any dependent, >300 weekly
downloads, or >1 maintainer — left-pad is the proof). Every gratuitous publish is
a permanent public-API + semver contract (Hyrum's Law: all observable behavior
becomes a contract someone depends on), a perpetual support surface, a new
supply-chain/account-takeover/postinstall attack vector, a dependency-confusion
namespace disclosure, and a real risk of leaking internal source (npm publishes
everything not in the `files` allowlist).

Concretely, most of the 32 unpublished packages disqualify themselves:
`@xnetjs/hub` and `@xnetjs/dashboard` are servers/app-shells, not libraries;
`@xnetjs/cloud` is **FSL-1.1 source-available** (NOT open source) — the
commercial control plane, which must never go to public npm; `experiments` and
`labs` are experimental by name and unstable by contract; and ~18 packages (ui,
editor, canvas, social, comms, ledger, maps, crm, formula, …) are unlicensed and
point `main`/`types` at `./src` with no `files` field — they are not even
packaged for npm consumption. `@xnetjs/hub` additionally ships as a **container**
([`hub-image.yml`](.github/workflows/hub-image.yml) /
[`hub-release.yml`](.github/workflows/hub-release.yml)), so npm is the wrong
channel regardless.

**The publishability bar.** A package earns a publish only when ALL of the
following hold:

1. **External audience** — something _outside_ the monorepo genuinely needs to
   `npm install` it. App-internal implementation detail stays a just-in-time
   `src/` Internal Package.
2. **Open-source license** — a real SPDX `license` (MIT/Apache-2.0) + on-disk
   `LICENSE`. FSL/source-available (cloud) and unlicensed packages are
   disqualified.
3. **Built dist entrypoint** — `exports`/`main`/`types` point at `./dist`, not
   `./src/index.ts`.
4. **`files` allowlist** — e.g. `["dist","README.md","LICENSE"]`; validate with
   `npm publish --dry-run` / `npm pack`.
5. **README** documenting install + public API for an external consumer.
6. **Stable-enough API** to honor semver — fast-moving/experimental packages do
   not take on that commitment yet.
7. **Fully-published runtime closure** — every `workspace:*` runtime dep is
   itself published, or removed/inlined/made dev-only. This is the hard
   correctness gate (see below).

```mermaid
flowchart TD
    ALL["46 packages"] --> Q1{"Library a consumer installs?<br/>(not an app / server / container)"}
    Q1 -- No --> KP["KEEP_PRIVATE (12)<br/>hub, cloud, dashboard, devtools, network, query,<br/>editor, canvas, comms, social, ledger, labs"]
    Q1 -- Yes --> Q2{"OSS license + dist entry + files[] +<br/>README + stable API +<br/>published runtime closure?"}
    Q2 -- "Yes (mechanical flip)" --> PN["PUBLISH_NOW (5)<br/>runtime, trust, slack-compat, formula, dictation"]
    Q2 -- "Not yet (packaging / closure work)" --> PWR["PUBLISH_WHEN_READY (16)<br/>billing, devkit, entitlements, licenses, telemetry,<br/>charts, maps, crm, canvas-core, experiments,<br/>unreal, vectors+brain, ui+views, sdk"]
    style KP fill:#fee2e2,stroke:#dc2626
    style PN fill:#dcfce7,stroke:#16a34a
    style PWR fill:#fef3c7,stroke:#d97706
```

If broad reuse is the actual strategic goal, the higher-leverage move is to
graduate the existing-but-ignored `@xnetjs/sdk` umbrella as a single versioned
compat anchor over the stable core — not to flip `private:false` on 32 modules
and inherit 32 permanent public contracts. (This is the same `@xnetjs/sdk`
meta-package floated as the post-1.0 escape valve in Decision C.)

#### Publish buckets — all 33 non-core decision targets

**PUBLISH_NOW** — MIT, clean closure, mechanical flip; several are required to
un-break the npm graph:

| Package | Why |
|---|---|
| `@xnetjs/runtime` | MIT, dist-built `createXNetClient()` spine that published `react`+`cli` already depend on. Config-publishable but UNTAGGED; only gaps are an on-disk LICENSE + actually tagging it. |
| `@xnetjs/trust` | MIT, zero-`@xnetjs`-dep leaf. Published `plugins@0.0.2`'s HEAD depends on it → publishing is the closure fix _and_ trivial. |
| `@xnetjs/slack-compat` | MIT, zero-`@xnetjs`-dep leaf (node:crypto only). Required to un-break `plugins`' closure. |
| `@xnetjs/formula` | Self-contained, zero-dep Notion-compatible formula engine with a polished README — the strongest pure external-reuse candidate. Needs license + dist-wire. |
| `@xnetjs/dictation` | MIT, zero runtime deps, excellent README. Provider-agnostic on-device STT. Only chore is dist-wire. |

**PUBLISH_WHEN_READY** — genuine libraries needing real but bounded
packaging/closure work:

| Package | Why |
|---|---|
| `@xnetjs/billing` | MIT, dist, zero `@xnetjs` runtime deps. Cleanest fix for `react`'s broken closure — but `react`'s edge is `import type`-only, so dev/peer-demotion or inlining is a valid alternative if billing stays commercial-adjacent. |
| `@xnetjs/devkit` | MIT, dist, zero runtime deps — the private dep that breaks `cli`. Broadest, most product-coupled surface (MCP/plugin-marketplace conventions); `cli` is its only consumer → prefer inlining or an explicit unstable-0.x note over a permanent public contract. |
| `@xnetjs/entitlements` | MIT, dist, zero `@xnetjs` runtime deps. Plan-catalog + signed `HUB_PLAN` token contract shared by hub + FSL cloud; publishing pre-unblocks a future hub publish. |
| `@xnetjs/licenses` | MIT, dist, single clean `@xnetjs/crypto` dep. Offline-verifiable license-token primitive; niche value — ship with the trust/plugins cluster. |
| `@xnetjs/telemetry` | dist, clean closure (core+data published, optional react peer). Privacy-preserving consent/telemetry lib. Needs license + flip. |
| `@xnetjs/charts` | Clean closure (echarts + peer react). Consumable ChartSpec-over-ECharts layer. Needs license + dist-wire + files[]. |
| `@xnetjs/maps` | Clean closure (only published `@xnetjs/data`). GeoJSON/CSV ingestion + MapLibre style construction. Needs license + README + dist-wire. |
| `@xnetjs/crm` | Cleanest closure — ZERO deps; pure pipeline/forecast/cadence/dedup math. Held back only by license + README. |
| `@xnetjs/canvas-core` | Zero `@xnetjs` runtime deps. Framework-agnostic infinite-canvas math (coords/tiles/camera/LOD). Publish this, not the React-bound `@xnetjs/canvas`. |
| `@xnetjs/experiments` | Perfect leaf — zero deps. Pure n=1 statistics library (NOT experimental despite the name). Needs license + a clearer public name. |
| `@xnetjs/unreal` | MIT, clean runtime closure (`@xnetjs/plugins` is dev-only; only `@xnetjs/data` is runtime). Governed UE6 connector. Needs README + dist-wire + stability check. |
| `@xnetjs/vectors` → `@xnetjs/brain` | Publish as a **pair**: `brain`'s tarball 404s until `vectors` ships. `vectors`' native `usearch` breaks browser builds → needs the `LinearVectorIndex` fallback + optional/external handling first. |
| `@xnetjs/ui` → `@xnetjs/views` | Publish only as a coherent public-UI-stack release: `views` runtime-depends on the private `ui`. Opinionated/xNet-flavored — commit to it as a public API or keep both private. |
| `@xnetjs/sdk` | The intended umbrella/compat-anchor — highest external value. BLOCKED: re-exports _values_ from private `network`+`query` and points at `src/`. The higher-leverage reuse play than publishing each member raw. |

**KEEP_PRIVATE** — no external audience, broken/heavy closure, or commercial/IP:

| Package | Why |
|---|---|
| `@xnetjs/cloud` | FSL-1.1 **source-available** (not OSS) commercial control plane, server-only. Never publish. Guarded only by `private:true` and **absent from `ignore`** → add to `ignore` for defense-in-depth. |
| `@xnetjs/hub` | Server/daemon distributed as a **container** — operators deploy the image, they don't `npm i`. Unlicensed + broken private-dep closure. |
| `@xnetjs/network` | Heavy xNet-specific p2p/libp2p transport keyed to xNet DIDs. Deliberately ignored; internal infra, not a general lib. |
| `@xnetjs/query` | Self-described secondary surface app code should NOT target (use react/runtime). Closure broken by private `network`. |
| `@xnetjs/editor` | Feature-rich collaborative editor hard-coupled to private `ui` (closure 404s); app-shaped, 12+ heavy public deps. |
| `@xnetjs/canvas` | High-level React canvas bound to xNet docs; deeply broken closure. Ship `canvas-core` instead. |
| `@xnetjs/devtools` | Internal dev-only protocol debugger that tree-shakes to a no-op in prod; drags in the whole private UI stack. |
| `@xnetjs/dashboard` | App-glue, not a library — gridstack builder wired to xNet widgets + SES sandbox. Worst closure in the set. |
| `@xnetjs/comms` | Library in form, but every layer is wired to xNet's substrate (Yjs Awareness, signed-node chat, hub signaling). Low external reuse. |
| `@xnetjs/social` | Cross-platform social-archive ingestion — a flagship product differentiator (X/Reddit/Instagram/TikTok importers). IP/strategy-sensitive. |
| `@xnetjs/ledger` | Unlicensed, README-less, `src/` entrypoint — not shaped for npm. Could graduate later if external demand appears. |
| `@xnetjs/labs` | Experimental, security-sensitive sandboxed code-exec (SES/QuickJS/Pyodide); depends on private `trust`. Default experimental → private. |

#### The broken-install dependency-closure bug

Three packages that already have npm tags have, **in HEAD**, acquired
`workspace:*` **runtime** dependencies (`dependencies`, not dev/peer) on
**private, unpublished** packages:

- `@xnetjs/react` → `@xnetjs/billing` (private:true)
- `@xnetjs/plugins` → `@xnetjs/trust` + `@xnetjs/slack-compat` (both private:true)
- `@xnetjs/cli` → `@xnetjs/devkit` (private:true)

**Severity framing (verified).** The _currently-live_ `@0.0.2` manifests on npm
do **not** contain these private deps — at the `@xnetjs/plugins@0.0.2` tag,
`plugins` depended only on `core`+`data` (`git show <tag>:packages/.../package.json`
confirms). They were added in later feature commits. So the bug is **latent in
HEAD**, shipping on the _next_ publish, not breaking the live registry today.
And because these deps are `private:true` (not `ignore`-listed),
`changeset publish` would in fact **ERROR before publishing** — a hard release
blocker rather than a silent 404. (They slipped precisely because they are
`private:true` rather than `ignore`-listed, so Changesets' own check didn't catch
them at version time.) Both framings lead to the same fix.

**The invariant:**

> The set of published packages must be CLOSED under runtime dependencies: for
> every published package, every `@xnetjs/*` package in its `dependencies` must
> also be published (or the dep removed, inlined, or demoted to
> dev/peer/type-only). `devDependencies` and `peerDependencies` do not enter the
> published closure.

This is why the publish-scope decision and this bug are _literally the same fix_:
a published tarball drags its entire runtime closure with it. "Publish
everything" does **not** fix it — it would force-publish the wrong things (FSL
`cloud`, unlicensed `src`-only internals) just to satisfy the resolver.

**Per-case fix** (all four deps are MIT + dist + zero `@xnetjs` runtime deps, so
each is a clean leaf). When the recommendations were implemented, recon found the
usage was deeper than first assumed — `cli → devkit` is a runtime import in
`bridge.ts`/`code.ts` (not just tests), and `react → billing`'s type leaks
through the publicly-exported `useBilling` hook — so **all four were published**
(they are already MIT and dist-built; publishing is the mechanical,
architecturally-honest fix, vs. inlining a shared primitive like `trust` that
`labs` also consumes):

1. **plugins → trust + slack-compat** — PUBLISHED both (`private:false`, `files[]`,
   `LICENSE`, provenance). Required to un-break an already-tagged package.
2. **react → billing** — PUBLISHED `@xnetjs/billing` (MIT; `useBilling` exposes
   its types publicly, so severing would break consumers' typecheck).
3. **cli → devkit** — PUBLISHED `@xnetjs/devkit` (MIT; runtime dep of `cli`).
   Flagged as the broadest/least-stable surface — revisit at 1.0.

Each leaf publishes **independently** (Tier 2; not added to the `fixed` group).
`@xnetjs/runtime` and `@xnetjs/abuse` (config-publishable but **UNTAGGED**) gained
on-disk LICENSE files and first-publish via the release cascade.

> **Implemented.** `scripts/check-publish-closure.mjs` (wired into the CI `lint`
> job as `pnpm check:publish-closure`) is the permanent guardrail: it fails the
> build if any `private:false` package has a `workspace:*` runtime dep that is
> `private:true` or in the `ignore` list. Validated: it flagged all four
> violations before the fix and exits clean after. **User action remaining:**
> configure npm OIDC trusted publishers for the four newly-public packages before
> their first release publish.

## Recommendation

**Keep the existing Changesets + OIDC pipeline. Make it commit-driven, richer,
and correct.** Concretely:

1. **A2 + Changeset bot** — auto-generate changesets from conventional commits,
   with the bot as a backstop and manual `pnpm changeset` retained for nuanced
   release notes.
2. **B2** — switch the changelog generator to `@changesets/changelog-github`.
3. **C — two-tier versioning**: keep the protocol core in the `fixed` lockstep
   group (a `core` breaking change correctly majors the whole compatibility
   set), and version the periphery independently (`cli` today; `charts`,
   `maps`, `crm`, … as they're added — they depend on a published _range_ of the
   core, not a lockstep version). **Fix the drift**: get `@xnetjs/abuse` either
   correctly bootstrapped + OIDC-configured _or_ removed from `fixed`; declare
   `@xnetjs/cli` intentionally independent and document it. Keep `@xnetjs/sdk`
   in mind as a future compatibility-anchor meta-package. Revisit Tier 1
   (lockstep core) at 1.0 if cadences diverge.
4. **D1** — OIDC only, plus a documented manual-publish runbook entry for
   outages, and pin `npm@latest` in the release job.
5. **Harden** with an optional protected GitHub **Environment** on the publish
   job so a human (or required reviewer) gates the actual `npm publish`, and so
   the trusted-publisher config can bind to that environment name.
6. **E — AI-assisted changesets (complement, not replace)**: keep the
   deterministic floor authoritative (`final = max(floor, ai)`); AI only
   _raises_ a bump and _drafts_ consumer notes from the real diff. Primary path
   is agent-native (a `/changeset` skill + a `.claude/settings.json` Stop hook so
   the agent that writes the code writes the changeset, reusing the proven
   `scripts/changelog/ai-release-notes.mjs` primitive); a suggest-only CI
   backstop (`pull_request`, never `pull_request_target`, no `id-token`/npm
   secrets) covers human/Dependabot PRs. The LLM never runs in the OIDC-privileged
   publish job — two human gates (PR review + Version-PR merge) sit between any AI
   output and a publish.
7. **F — curate, don't publish everything**: stay internal-by-default; publish a
   small, OSS-licensed, dependency-closed subset behind the publishability bar.
   **Fix the closure bug first** (publish `trust`/`slack-compat`; publish-or-sever
   `billing`; inline-or-publish `devkit`; tag `runtime`/`abuse`) and add the CI
   closure guard. Never publish `@xnetjs/cloud` (FSL) — add it to `ignore` for
   defense-in-depth. If reach is the goal, graduate the `@xnetjs/sdk` umbrella as
   the public front door rather than flipping 32 modules public.

This satisfies the request and then some — automatic publishing for all core
packages (already true), commit-driven semver (new), good AI-drafted release
notes (new), a principled two-tier versioning topology, and a deliberate publish
scope that fixes a latent release-blocker — all while preserving a system that
already works and is already documented.

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

…is removed from `ignore`, has an OIDC trusted publisher configured on npm, and
passes `pnpm publish --dry-run`. **Then decide its tier** (next example): add it
to `fixed` _only_ if it's part of the protocol compatibility set; otherwise
leave it out and let it version independently.

### 5. Two-tier versioning config — `.changeset/config.json`

The key principle: `fixed` lists **only** the coupled protocol core. Everything
else publishable is simply _not_ in `fixed` (and not in `ignore`) → it versions
independently and bumps only when it (or a dependency) actually changes.

```jsonc
{
  "changelog": ["@changesets/changelog-github", { "repo": "crs48/xNet" }],
  "commit": false,

  // TIER 1 — coupled protocol core: always share one identical version.
  // A breaking change to any member majors and republishes the whole set.
  "fixed": [[
    "@xnetjs/core", "@xnetjs/crypto", "@xnetjs/identity",
    "@xnetjs/sync", "@xnetjs/sqlite", "@xnetjs/storage",
    "@xnetjs/data", "@xnetjs/data-bridge", "@xnetjs/history",
    "@xnetjs/plugins", "@xnetjs/react"
    // NOTE: @xnetjs/abuse intentionally NOT here until bootstrapped (see #6)
  ]],

  // TIER 2 — independent: publishable, but NOT in `fixed`. Versions on its own
  // cadence; a core major does NOT drag it along. (@xnetjs/cli today; future
  // feature pkgs like charts/maps/crm go here, not in `fixed`.)
  // → nothing to configure: just keep them out of both `fixed` and `ignore`.

  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",  // Tier-2 deps on core → patch cascade
  "ignore": [ /* unpublished pkgs only: canvas, devtools, editor, … */ ]
}
```

The single most important rule for the catalog going forward: **as you add
feature packages, default them to Tier 2 (independent).** Only add a package to
`fixed` if it is genuinely part of the protocol compatibility set and will
always release with the core.

### 6. Fixing the `abuse` drift

```bash
# Verify what npm thinks exists
npm view @xnetjs/abuse version    # → 404 today (never published)

# Decide: include abuse in the lockstep group?
#  YES → configure its OIDC trusted publisher BEFORE the next release,
#        so the force-bump-to-group-version first publish succeeds.
#  NO  → remove "@xnetjs/abuse" from `fixed` and add it to `ignore`
#        until its packaging contract is ready.
```

### 7. AI-assisted changeset generation (agent-native + CI backstop)

**Agent-native enforcement (`.claude/settings.json`) — a Stop hook makes the
agent author its own changeset (deterministic; CLAUDE.md rules alone are
probabilistic):**

```jsonc
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            // Exit non-zero with a reason on stderr to BLOCK turn-end until
            // .changeset/ covers every affected publishable packages/* dir.
            "command": "node scripts/changeset/assert-coverage.mjs"
          }
        ]
      }
    ]
  }
}
```

**Terse CLAUDE.md convention (Vercel `AGENTS.md` pattern; keep it short — the
project MEMORY index is already over budget):**

```md
## Changesets
Every change to a publishable `packages/*` lib MUST produce a `.changeset/*.md`
before the turn ends. Run `/changeset` (reads the diff, picks the bump, writes
the file). Use `changeset --empty` for docs/tooling-only work. The AI bump is a
SUGGESTION floored by the commit prefix: `final = max(conventional, ai)`.
```

**CI backstop (`.github/workflows/ai-changeset.yml`) — suggest-only, no publish
credentials:**

```yaml
name: AI changeset (suggest)
on:
  pull_request: # fork-safe: never pull_request_target
    types: [opened, synchronize]
permissions: {} # default-deny; grant per job
concurrency:
  group: ai-changeset-${{ github.event.pull_request.number }}
  cancel-in-progress: true # bound cost on chatty PRs
jobs:
  suggest:
    runs-on: ubuntu-latest
    permissions:
      contents: write # push to PR HEAD branch (internal PRs)
      pull-requests: write # post the bump-rationale comment
      # NO id-token:write, NO npm secrets — Agents Rule of Two
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: ./.github/actions/setup
      # 1) Deterministic floor FIRST (authoritative; AI can only RAISE).
      - run: pnpm dlx changeset-conventional-commits
      # 2) AI suggests bump + drafts prose from the real diff. Fail-open.
      - name: AI changeset
        continue-on-error: true # a 429/outage never reds a required check
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} # PR-tier only
        run: |
          git diff origin/${{ github.base_ref }}...HEAD \
            -- $(node scripts/changeset/publishable-pathspec.mjs) \
            | node scripts/changeset/ai-generate.mjs
      # 3) Commit back to PR HEAD via stamp-pr-number.yml's App-token + rebase loop;
      #    degrade to a sticky PR comment on fork PRs (cannot push).
      - uses: actions/create-github-app-token@v1
        id: app
        with:
          app-id: ${{ vars.CHANGELOG_APP_ID }}
          private-key: ${{ secrets.CHANGELOG_APP_PRIVATE_KEY }}
```

`scripts/changeset/ai-generate.mjs` is a clone of the proven, fail-open
[`scripts/changelog/ai-release-notes.mjs`](scripts/changelog/ai-release-notes.mjs)
(zero-dep, direct Anthropic fetch, default `claude-haiku-4-5`), but fed the diff
**scoped to publishable packages only** (so `cloud`/`billing`/`entitlements`
source never leaves the machine), emitting `{ package: { bump, summary } }` and
writing via `@changesets/write` after applying `max(floor, ai)`.

### 8. CI guard — a published package's runtime closure must be published

This is the standing gate that turns Decision F's latent bug into a hard
pre-publish check:

```js
// scripts/check-publish-closure.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const cfg = JSON.parse(readFileSync('.changeset/config.json', 'utf8'))
const ignore = new Set(cfg.ignore ?? [])
const meta = {}
for (const d of readdirSync('packages')) {
  const f = `packages/${d}/package.json`
  if (existsSync(f)) {
    const p = JSON.parse(readFileSync(f, 'utf8'))
    if (p.name) meta[p.name] = p
  }
}
// A package publishes iff it is not private and not ignored.
const published = (n) => meta[n] && meta[n].private !== true && !ignore.has(n)

let bad = 0
for (const [name, p] of Object.entries(meta)) {
  if (!published(name)) continue
  for (const dep of Object.keys(p.dependencies ?? {})) {
    // devDependencies / peerDependencies do NOT enter the published closure.
    if (dep.startsWith('@xnetjs/') && !published(dep)) {
      console.error(`✗ ${name} -> unpublished runtime dep ${dep}`)
      bad++
    }
  }
}
if (bad) {
  console.error(`\n${bad} broken-closure dependency(ies). Publish, inline, or demote them.`)
  process.exit(1)
}
console.log('✓ every published package has a fully-published runtime closure')
```

Run it in a fast PR job (no workspace install needed). Against HEAD today it
exits `1`, naming `react→billing`, `plugins→trust`, `plugins→slack-compat`,
`cli→devkit`.

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
  Note this interacts with lockstep: in the `fixed` core, whichever rule you
  pick applies to **all** core packages at once.
- **Open question:** lockstep churn vs. legibility. `fixed` republishes
  untouched core packages on every release (lots of "Updated dependencies"
  no-op changelog entries). Accepted pre-1.0 for the compatibility guarantee —
  but if the noise becomes a problem, the path is independent + an
  `@xnetjs/sdk` compatibility-anchor meta-package, **not** `linked` (which would
  let core versions silently drift apart and defeat the guarantee).
- **Open question:** Tier-1 revisit trigger at 1.0. Decide now what signal
  flips the core from lockstep to independent (e.g. "two consecutive releases
  where ≥half the core had no real change"), so the decision isn't perpetually
  deferred.

### AI-assisted changesets (Decision E)

- **Prompt injection can still silently _under_-bump (the `max()` blind spot).**
  `final = max(deterministic, ai)` only protects when the floor is correct: a
  genuinely breaking change committed as `fix:` has a `patch` floor, and an
  injected diff comment ("non-breaking refactor, patch only", OWASP LLM01) can
  push the AI to agree — `max(patch, patch) = patch` ships the break. Mitigation:
  a deterministic, non-AI **public-API-surface diff check** (removed/renamed
  exports, changed signatures, protocol/schema/hash-contract version) as a
  required check that fails when a likely-major signal coexists with a
  patch/minor changeset — injection-proof because it reads the AST, not the model.
- **Private source egress.** This is a mixed public/private monorepo: only ~14
  packages publish. A naïve generator sends the _full_ diff to Anthropic. The
  diff MUST be scoped to the publishable set via a git pathspec, plus a
  secret-redaction pass that **fails-closed on scope** (distinct from fail-open
  on API error). Require a no-train API tier; document a `CHANGESET_SKIP_AI`
  opt-out.
- **Wrong-but-plausible release notes ship verbatim.** `max()` guards the
  version number; the prose has no deterministic counterpart. Mitigation: adopt
  `@changesets/changelog-github` (PR backlink → traceable), prefix the AI body
  with a deterministic diff-derived factual stub (symbols added/removed), and
  require a human edit of any **major**-bump changeset before the Version PR
  merges.
- **Non-determinism at the _generation_ step.** Reruns can pick different prose /
  a different (≥ floor) bump. Make generators idempotent (skip if
  `changeset status` already covers the package), pin model + low temperature,
  and record the model id in the changeset for audit.
- **The deterministic floor is recommended-but-unbuilt today** (0 lockfile hits
  for `changeset-conventional-commits`). Build the floor FIRST so the AI bump is
  never unfloored.

### Publish scope & closure (Decision F)

- **`devkit` is the riskiest closure-fix publish** (~2k LOC exposing MCP /
  plugin-marketplace conventions + a loopback HTTP bridge). Publishing commits us
  to public semver on an evolving, product-coupled surface; `cli` is its only
  consumer. Lean **sever/inline, not publish**, unless concrete external demand
  appears.
- **The four closure-fix leaves currently lack a `files` allowlist** and have
  `src/` + `*.test.ts` beside `dist/` — `npm publish` would ship source + tests.
  Test fixtures contain _fake_ secrets (`sk_test`/`whsec_test`), so not a real
  leak, but add `files:["dist","README.md","LICENSE"]` + `npm pack --dry-run`
  first.
- **`react→billing` is `import type`-only** — the closure prose mildly overstates
  it as a hard runtime dep, which makes dev/peer-demotion a cleaner option than
  publishing the commercial-adjacent `billing`. Needs an explicit commercial-intent
  call.
- **`@xnetjs/cloud` (FSL, commercial) is guarded by a single `private:true` and
  is NOT in `ignore`.** One flipped boolean ships the moat to public npm. Add it
  to `ignore` for defense-in-depth.
- **SPDX nit:** if anything source-available is ever published, the canonical id
  is `FSL-1.1-ALv2`, not the template name `FSL-1.1-Apache-2.0` in `cloud`'s
  package.json — the latter trips npm's SPDX validator.
- **`sdk` umbrella sequencing:** graduating it requires first publishing (or
  dropping the value re-exports of) the private `network` + `query` — decide
  before promising `sdk` as the public front door.
- **Open question:** do we want an external audience at all yet? Several
  PUBLISH_WHEN_READY packages have real reuse value, but each is a permanent
  public contract. Default to **need-driven** publishing (publish when an external
  consumer asks), not speculative.

## Implementation Checklist

- [x] Install `@changesets/changelog-github` and switch the `changelog` field
      in [`.changeset/config.json`](.changeset/config.json) to it with
      `{ "repo": "crs48/xNet" }`.
- [x] Add `changeset-conventional-commits` (pinned) and a
      `changeset:from-commits` root script.
- [ ] Add the generation + auto-commit step to
      [`npm-release.yml`](.github/workflows/npm-release.yml) **before**
      `changesets/action`.
- [x] Pin `npm install -g npm@latest` in the release job (OIDC ≥ 11.5.1).
- [ ] Install the [Changeset bot](https://github.com/apps/changeset-bot) on
      `crs48/xNet`.
- [x] **Adopt the two-tier topology explicitly**: confirm `fixed` lists _only_
      the coupled protocol core; ensure feature/tool packages stay out of both
      `fixed` and `ignore` (independent). Document the rule "new feature
      packages default to independent" in the runbook.
- [ ] Resolve `@xnetjs/abuse`: either configure its npm OIDC trusted publisher
      and let it first-publish into the core group, or remove it from `fixed`
      (and from `ignore`) so it versions independently / stays unpublished.
- [x] Declare `@xnetjs/cli` topology explicitly (independent) and note it in
      [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md).
- [ ] Record the Tier-1-revisit-at-1.0 trigger and the `@xnetjs/sdk`
      compatibility-anchor escape valve in the runbook.
- [ ] (Optional) Add a protected GitHub Environment to the publish job and bind
      trusted-publisher configs to that environment name.
- [ ] Update [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md) and
      [`docs/npm-release-quickstart.md`](docs/npm-release-quickstart.md) for the
      new commit-driven flow and the manual-publish escape hatch.
- [ ] Decide the pre-1.0 `BREAKING CHANGE` → minor-vs-major policy and encode it
      (config or runbook).

### AI-assisted changesets (Decision E)

- [x] Build the deterministic floor FIRST: add `changeset-conventional-commits`
      as a CI step + a plain-Node reconciler enforcing
      `final_bump = max(deterministic, ai)` per package.
- [x] Write `scripts/changeset/ai-generate.mjs` as a fail-open, zero-dep clone of
      [`scripts/changelog/ai-release-notes.mjs`](scripts/changelog/ai-release-notes.mjs),
      emitting `{package:{bump,summary}}` and writing via `@changesets/write`.
- [ ] Add `scripts/changeset/publishable-pathspec.mjs` (derives the publishable
      set from `.changeset/config.json`) and scope the diff with
      `git diff -- <pathspec>` so private packages never enter the prompt;
      add a secret-redaction/abort pass (fail-closed on scope).
- [x] Create the `/changeset` skill at `.claude/skills/changeset/SKILL.md`
      (grounds the agent in the diff + `turbo --affected`, honors the 12-package
      `fixed` fan-out and `changeset --empty`).
- [x] Create net-new `.claude/settings.json` with a Stop/SubagentStop hook
      (`scripts/changeset/assert-coverage.mjs` via `changeset status --since=main`)
      that blocks turn-end on uncovered publishable `packages/*`.
- [x] Add a terse CLAUDE.md changeset convention (keep it short — MEMORY index is
      over budget).
- [x] Add `.github/workflows/ai-changeset.yml` on `pull_request`
      (never `pull_request_target`), `permissions: {}` default-deny, granting
      only `contents:write` + `pull-requests:write` — never `id-token:write` or
      npm secrets; reuse `stamp-pr-number.yml`'s App-token + `[skip ci]` + rebase
      loop to push to the PR HEAD branch.
- [ ] Add the deterministic public-API-surface diff check as a required PR check
      (fails when a likely-major signal coexists with a patch/minor changeset).
- [x] Confirm `npm-release.yml` stays LLM-free and never sees `ANTHROPIC_API_KEY`.

### Publish scope & closure (Decision F)

- [x] **Fix the closure bug (leaf-first):** publish `@xnetjs/trust` +
      `@xnetjs/slack-compat` (flip `private:false`, add
      `files:["dist","README.md","LICENSE"]`, bump off 0.0.1) to un-break
      `@xnetjs/plugins`.
- [x] Decide `billing`: publish as an MIT leaf _or_ demote `react`'s
      `import type`-only dep to dev/peer/inline; implement the chosen path.
- [x] Decide `devkit`: inline into `@xnetjs/cli` (preferred) _or_ publish with an
      explicit unstable-0.x note; add an on-disk LICENSE either way.
- [ ] Tag the config-publishable-but-UNTAGGED `@xnetjs/runtime` (add its missing
      LICENSE) and `@xnetjs/abuse`.
- [x] Add `@xnetjs/cloud` to the `.changeset/config.json` `ignore` list
      (defense-in-depth; today guarded only by `private:true`).
- [x] Add `scripts/check-publish-closure.mjs` (example 8) to a CI job that fails
      on any published package with an unpublished `@xnetjs/*` runtime dep.
- [x] Record the three buckets + the publishability bar in
      [`docs/npm-release-runbook.md`](docs/npm-release-runbook.md) so future
      packages are slotted deliberately, not flipped `private:false` by default.
- [ ] (When pursued) graduate `@xnetjs/sdk` as the public compat-anchor umbrella
      rather than publishing each member raw.

## Validation Checklist

- [ ] On a test branch, land a `fix:` commit and confirm CI generates a
      `patch` changeset; a `feat:` generates `minor`; a `feat!:` /
      `BREAKING CHANGE` generates `major`.
- [x] `pnpm changeset status` lists the expected bumps locally.
- [x] **Topology check:** a changeset touching only `@xnetjs/core` bumps the
      _entire fixed core_ (lockstep working) but does **not** bump `@xnetjs/cli`
      to a new major (independent tier working — cli gets at most a patch
      dependency bump if it consumes core).
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

### AI-assisted changesets (Decision E)

- [x] Confirm `npm-release.yml` has zero Anthropic references and the AI workflow
      has no `id-token:write` and no npm/OIDC secrets (`grep` over
      `.github/workflows/`).
- [x] Verify the AI workflow triggers on `pull_request` only, never
      `pull_request_target`.
- [ ] Test an injected diff comment ("non-breaking, patch only") cannot LOWER a
      bump: assert `final = max(floor, ai)` holds when `ai < floor`.
- [ ] Test the public-API-surface check FAILS a PR that removes an exported symbol
      while the changeset says `patch`/`minor`.
- [x] Stage a change in `packages/cloud` (private) + `packages/core` (published)
      and assert only `core` content reaches the prompt (scoping works).
- [x] Confirm fail-open: with `ANTHROPIC_API_KEY` unset or a forced 429, the hook
      and CI step exit 0 and fall back to the deterministic changeset.
- [x] Confirm the Stop hook blocks turn-end on an uncovered publishable change and
      passes on `changeset --empty` for docs/tooling-only work.

### Publish scope & closure (Decision F)

- [x] Run `node scripts/check-publish-closure.mjs` against HEAD and confirm it
      flags all four current violations (`react→billing`, `plugins→trust`,
      `plugins→slack-compat`, `cli→devkit`); after the fix it exits 0.
- [ ] Clean-room install off a machine without the workspace
      (`npm i @xnetjs/plugins@<new>` in an empty dir) resolves with no 404 — the
      monorepo cache masks the bug.
- [x] `changeset publish --dry-run` no longer ERRORs on a non-ignored package
      depending on a non-published package.
- [x] `npm pack` each newly-published package: `dist/` + README + LICENSE present;
      `src/`, `*.test.ts`, `*.stories.*` absent.
- [x] Confirm `@xnetjs/cloud` is in the `ignore` list and that flipping its
      `private` flag alone no longer makes it publishable.
- [x] Spot-check that no KEEP_PRIVATE package became publishable as a transitive
      side effect of the closure fixes.

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
- Versioning topology: [changesets fixed-packages](https://github.com/changesets/changesets/blob/main/docs/fixed-packages.md) · [changesets linked-packages](https://github.com/changesets/changesets/blob/main/docs/linked-packages.md) · [Nx — "10 Monorepo Myths Debunked" (lockstep is a choice)](https://nx.dev/blog/monorepo-myths-debunked) · [Microsoft ISE — monorepo with independent release cycles](https://devblogs.microsoft.com/ise/streamlining-development-through-monorepo-with-independent-release-cycles/)
- [Changesets vs Semantic Release — Brian Schiller](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/)
- [Automated Releases with Conventional Commits and release-please](https://devopsil.com/articles/2026-03-21-semantic-versioning-automated-releases)
- AI-assisted changesets (Decision E): existing repo primitive [`scripts/changelog/ai-release-notes.mjs`](scripts/changelog/ai-release-notes.mjs) · [`stamp-pr-number.yml`](.github/workflows/stamp-pr-number.yml) (commit-back template) · [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) · [Better Auth `auto-changeset.yml` (production precedent: Claude reads PR diff → writes `.changeset/*.md`)](https://github.com/better-auth/better-auth/blob/main/.github/workflows/auto-changeset.yml) · [`@changesets/write`](https://www.npmjs.com/package/@changesets/write) · [Claude Code hooks (Stop/SubagentStop)](https://code.claude.com/docs/en/hooks) · [Vercel `AGENTS.md` "always create a changeset"](https://github.com/vercel/vercel/blob/main/AGENTS.md)
- AI-in-CI security: [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) · [Microsoft — Securing CI/CD in an agentic world (Claude Code Action case, Agents Rule of Two)](https://www.microsoft.com/en-us/security/blog/2026/06/05/securing-ci-cd-in-agentic-world-claude-code-github-action-case/) · [Wiz — GitHub Actions security guide (fork-safe triggers, least-privilege)](https://www.wiz.io/blog/github-actions-security-guide)
- Publish scope (Decision F): [Turborepo — Internal Packages (internal-by-default)](https://turborepo.dev/docs/core-concepts/internal-packages) · [Turborepo — Publishing Libraries](https://turborepo.dev/docs/guides/publishing-libraries) · [Nx — Buildable & Publishable Libraries](https://nx.dev/docs/concepts/buildable-and-publishable-libraries) · [Changesets — config-file-options (ignore/private semantics)](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md) · [npm — Unpublish Policy (72h immutability)](https://docs.npmjs.com/policies/unpublish/) · [npm CLI #2035 — unpublished workspace dep 404s on install](https://github.com/npm/cli/issues/2035) · [Highlight/LaunchDarkly — publishing with private pnpm-monorepo deps (sever-not-publish)](https://launchdarkly.com/docs/tutorials/publishing-private-pnpm-monorepo) · [Sentry licensing — open-core (MIT SDKs, FSL server)](https://open.sentry.io/licensing/) · [FSL-1.1-ALv2 canonical SPDX id](https://spdx.org/licenses/FSL-1.1-ALv2.html) · [Hyrum's Law](https://www.hyrumslaw.com/) · [OWASP npm Security Cheat Sheet (`files` allowlist)](https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html)
