# 0053 - Pre-commit Quality Gates & CI Hardening

> **Status:** Exploration
> **Tags:** CI, DX, git hooks, husky, lint-staged, eslint, typecheck, vitest, turbo, agent-workflow
> **Created:** 2026-02-05
> **Context:** CI failures from lockfile drift, lint errors, and type errors waste time — especially for AI agents that commit frequently and can't monitor GitHub Actions. This exploration covers adding pre-commit hooks (husky + lint-staged + affected typecheck + affected tests), hardening CI, fixing the ~179 existing ESLint errors, and documenting the setup in AGENTS.md.

## Problem

The error looks like this:

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because
pnpm-lock.yaml is not up to date with apps/electron/package.json
```

### Root Cause Chain

1. Developer adds/removes/changes a dependency in a `package.json`
2. Developer runs `pnpm install` locally (updates lockfile)
3. Developer forgets to commit the updated `pnpm-lock.yaml`, or never ran `pnpm install` at all
4. PR merges to `main`
5. `ci.yml` passes — it uses bare `pnpm install` (no `--frozen-lockfile`), so it silently regenerates the lockfile in CI
6. `electron-release.yml` fails — it uses `--frozen-lockfile` and correctly rejects the drift

The core issue: **there is no enforcement that `pnpm-lock.yaml` stays in sync with `package.json` at any point before the release build**.

### Current State

| Workflow               | Install Command                   | Catches Drift?          |
| ---------------------- | --------------------------------- | ----------------------- |
| `ci.yml` (test)        | `pnpm install`                    | No                      |
| `ci.yml` (build)       | `pnpm install`                    | No                      |
| `electron-release.yml` | `pnpm install --frozen-lockfile`  | **Yes** (too late)      |
| `deploy-site.yml`      | `pnpm install --ignore-workspace` | N/A (separate lockfile) |

Other missing guardrails:

- No `.npmrc` with `frozen-lockfile=true`
- No pre-commit hooks (no husky, no lint-staged)
- No CI step that explicitly validates lockfile freshness

## Solutions

### Option A: Add `--frozen-lockfile` to `ci.yml` (Recommended)

The simplest fix. Make the CI workflow that runs on every PR use frozen-lockfile so drift is caught immediately.

**Changes to `.github/workflows/ci.yml`:**

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

Apply to both the `test` and `build` jobs.

**Pros:**

- One-line change per job (2 lines total)
- Catches the problem at PR time, not release time
- No new tooling or developer workflow changes
- Matches what pnpm recommends for CI environments

**Cons:**

- Developers must remember to run `pnpm install` and commit the lockfile
- No local guardrail — the feedback loop is still "push, wait for CI"

### Option B: `.npmrc` with `frozen-lockfile=true` (Complement to A)

Create a root `.npmrc` that sets the default:

```ini
frozen-lockfile=true
```

This makes `pnpm install` in CI environments default to frozen mode. However, this also affects local development — developers would need to use `pnpm install --no-frozen-lockfile` or just `pnpm add <pkg>` (which ignores the setting). This can be surprising.

**Better alternative** — use the CI-only setting:

```ini
# .npmrc
# In CI, pnpm already defaults to frozen-lockfile.
# This ensures it's explicit and consistent.
ci=true
```

Wait — pnpm already defaults `frozen-lockfile=true` when `CI=true` (which GitHub Actions sets). The reason our `ci.yml` doesn't enforce it is that `pnpm install` without `--frozen-lockfile` explicitly overrides nothing — but pnpm v9 **does** default to frozen in CI. Let me verify:

Actually, pnpm v9 sets `frozen-lockfile=true` when `CI` env var is set **unless** there's no lockfile at all. So our `ci.yml` should already be failing... unless the lockfile exists but is just stale. Let me re-examine: the `ERR_PNPM_OUTDATED_LOCKFILE` error message itself says "in CI environments this setting is true by default." So the bare `pnpm install` in `ci.yml` **should** be failing too.

**Revised analysis:** If `ci.yml` is currently passing with a stale lockfile, one of these is true:

1. The lockfile was stale only for `electron-release.yml` runs (different commit)
2. `ci.yml` runs passed before the drift was introduced, and the release was triggered on a later commit
3. The `pnpm/action-setup` version or configuration is suppressing the frozen behavior

Regardless, being explicit with `--frozen-lockfile` removes all ambiguity.

### Option C: Pre-commit Hook with Husky (Defense in Depth)

Add a git hook that verifies the lockfile is fresh before allowing a commit that touches any `package.json`.

```bash
# Install
pnpm add -Dw husky
pnpm exec husky init
```

```bash
# .husky/pre-commit
#!/bin/sh

# If any package.json was modified, ensure lockfile is up to date
if git diff --cached --name-only | grep -q 'package.json'; then
  pnpm install --lockfile-only
  git diff --exit-code pnpm-lock.yaml || {
    echo "ERROR: pnpm-lock.yaml is out of date. Run 'pnpm install' and commit the lockfile."
    exit 1
  }
fi
```

**Pros:**

- Catches the issue before it ever leaves the developer's machine
- Zero CI cost
- Only runs when `package.json` files are staged

**Cons:**

- Adds husky as a dev dependency
- Developers can bypass with `--no-verify`
- Adds ~1-2s to commits that touch `package.json`
- Team must opt in (requires `pnpm install` to set up hooks via `prepare` script)

### Option D: Dedicated CI Lockfile Check Job (Belt and Suspenders)

Add a fast job to `ci.yml` that explicitly checks lockfile freshness without installing:

```yaml
lockfile-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v3
      with:
        version: 9

    - uses: actions/setup-node@v4
      with:
        node-version: 20

    - name: Verify lockfile is up to date
      run: |
        pnpm install --lockfile-only
        git diff --exit-code pnpm-lock.yaml || {
          echo "::error::pnpm-lock.yaml is out of date with package.json files."
          echo "::error::Run 'pnpm install' locally and commit the updated lockfile."
          exit 1
        }
```

This is different from `--frozen-lockfile`: it regenerates the lockfile from scratch and checks if it matches what's committed. This catches cases where the lockfile was generated with a different pnpm version or has other subtle corruption.

**Pros:**

- Fast (~10s, no full install)
- Catches version mismatches and corruption, not just drift
- Clear error message with instructions

**Cons:**

- Extra CI job (minimal cost)
- Slightly redundant with `--frozen-lockfile`

## Recommendation

**Implement A + C.** This gives both fast CI feedback and local prevention:

| Layer        | Mechanism                                     | Catches When  |
| ------------ | --------------------------------------------- | ------------- |
| Local        | Husky pre-commit hook                         | Before commit |
| CI (PR)      | `--frozen-lockfile` in `ci.yml`               | Before merge  |
| CI (Release) | `--frozen-lockfile` in `electron-release.yml` | Already there |

### Implementation Steps

1. **Update `ci.yml`** — change both `pnpm install` lines to `pnpm install --frozen-lockfile`
2. **Add husky** — `pnpm add -Dw husky`, add `prepare` script, create pre-commit hook
3. **Add `.npmrc`** — optional, but makes intent explicit:
   ```ini
   # Prevent accidental lockfile drift in CI
   # Developers: use `pnpm add <pkg>` to add deps (this doesn't apply to `pnpm add`)
   frozen-lockfile=true
   ```
   Note: `frozen-lockfile=true` in `.npmrc` only affects bare `pnpm install`, not `pnpm add`.

### What NOT to Do

- **Don't use `--no-frozen-lockfile` in release workflows** — that defeats the purpose
- **Don't remove the lockfile from git** — it ensures reproducible builds
- **Don't add `pnpm install` as a CI "fix" step** — that masks real drift
- **Don't rely solely on local hooks** — they can be bypassed

## Appendix: Diff of the Lockfile Error

The specific failure from the issue shows `electron-updater` was added to `apps/electron/package.json` but the lockfile still had the old specifiers without it:

```diff
- Lockfile specifiers (missing electron-updater)
+ package.json specifiers (has "electron-updater": "^6.3.0")
```

This is the classic case: someone ran `pnpm add electron-updater` locally, committed `package.json`, but the lockfile update either wasn't committed or was lost in a merge.

## Beyond Lockfiles: Full Pre-commit Quality Gates

The lockfile issue is a symptom of a broader gap — there are no local quality gates at all. Here's what currently runs only in CI (or not at all) that could catch issues before they leave the developer's machine.

### Current State

| Check                            | Runs in CI?            | Runs Locally?  | Scope Gap                               |
| -------------------------------- | ---------------------- | -------------- | --------------------------------------- |
| `pnpm install --frozen-lockfile` | Only in release        | Never enforced | Lockfile drift                          |
| `eslint`                         | Yes (`pnpm lint`)      | Editor only    | `apps/` not linted at all               |
| `prettier`                       | **No**                 | Editor only    | No `format:check` script exists         |
| `tsc --noEmit`                   | Yes (`pnpm typecheck`) | Editor only    | Slow feedback loop                      |
| `vitest`                         | Yes (`pnpm test`)      | Manual only    | Editor tests silently excluded          |
| `commitlint`                     | **No**                 | **No**         | No commit message convention enforced   |
| `react-hooks` lint rules         | **No**                 | **No**         | Not installed despite heavy React usage |

### What to Implement

#### Phase 0: Fix Existing Errors (prerequisite for all hooks)

Pre-commit hooks can't be turned on if the codebase already has errors — agents and developers would be blocked from committing files they didn't break. These must be fixed first.

- [x] **Fix all 179 ESLint errors** — breakdown by rule:
      | Rule | Count | Fix Strategy |
      |---|---|---|
      | `@typescript-eslint/no-unused-vars` | 155 | Remove unused imports/vars, prefix unused params with `_` |
      | `@typescript-eslint/ban-types` (`Function`) | 7 | Replace with specific function signatures |
      | `prefer-const` | 6 | Auto-fix with `eslint --fix` |
      | `no-case-declarations` | 4 | Wrap case bodies in blocks `{ }` |
      | `no-extra-semi` | 2 | Auto-fix with `eslint --fix` |
      | `no-constant-condition` | 2 | Replace with explicit boolean or comment |
      | `no-this-alias` | 1 | Refactor to use arrow function |
      | `no-inner-declarations` | 1 | Move function to module scope |
      | `react-hooks/exhaustive-deps` (missing plugin) | 1 | Remove rule reference or install plugin |

- [ ] **Fix existing typecheck errors** — `@xnet/storage` and `@xnet/sync` currently have type errors. `turbo typecheck --affected` will block commits to those packages until fixed.
- [ ] **Fix or skip flaky perf tests** — two timing-sensitive tests fail on loaded machines:
  - `crypto/src/hashing.test.ts`: "should hash 1MB in under 50ms" (measured 106ms)
  - `crypto/src/signing.test.ts`: "should verify many signatures efficiently" (measured 660ms vs 500ms threshold)

  Options: bump thresholds, use `test.skipIf(process.env.CI)`, or tag them and exclude from pre-commit runs.

- [ ] **Update AGENTS.md with git hooks section** — once hooks are live, agents need to know: what hooks exist, what they check, expected timing (~10-15s), and that `--no-verify` is available for emergencies. Without this, agents will be confused by commit failures.

#### Phase 1: CI Fixes (immediate, no workflow change for developers)

- [ ] **`ci.yml`: Use `--frozen-lockfile`** — change both `pnpm install` lines to `pnpm install --frozen-lockfile`. Catches lockfile drift at PR time instead of release time.
- [ ] **`ci.yml`: Add Prettier check** — add `pnpm prettier --check "packages/**/*.{ts,tsx}" "apps/**/*.{ts,tsx}"` step. Currently formatting is never validated anywhere.
- [ ] **`ci.yml`: Lint `apps/` too** — change lint script from `eslint packages --ext .ts,.tsx` to `eslint packages apps --ext .ts,.tsx`, or move to a Turbo-based lint task so each package/app lints itself.

#### Phase 2: Git Hooks (local enforcement, fast feedback)

- [ ] **Install husky** — `pnpm add -Dw husky`, add `"prepare": "husky"` to root `package.json`. Gives us the hook infrastructure.
- [ ] **Install lint-staged** — `pnpm add -Dw lint-staged`. Runs checks only on staged files so hooks stay fast.
- [ ] **Pre-commit: lint-staged config** — add to root `package.json`:
  ```json
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"],
    "package.json": ["pnpm install --lockfile-only"]
  }
  ```
  This gives us:
  - **ESLint + autofix** on staged `.ts`/`.tsx` files (~2-3s on changed files)
  - **Prettier formatting** enforced automatically (no more style drift)
  - **Lockfile sync** whenever any `package.json` is staged (the original problem)
- [ ] **Pre-commit: affected tests + typecheck** — Vitest and Turbo both support running only what's affected by the current changes. Measured timings show this is fast enough for pre-commit:

  | Command                                | What It Does                                           | Time                              |
  | -------------------------------------- | ------------------------------------------------------ | --------------------------------- |
  | `vitest related <file>`                | Runs tests that import the changed file (transitive)   | **5-8s** for a single source file |
  | `vitest run --changed HEAD`            | Runs tests affected by uncommitted changes (git-aware) | **~8s** (scales with change size) |
  | `turbo run typecheck --affected`       | Typechecks only packages with changes vs `main`        | **3-5s** (with Turbo cache)       |
  | `pnpm --filter @xnet/crypto typecheck` | Typechecks a single package                            | **~3.5s**                         |

  Suggested hook:

  ```bash
  # .husky/pre-commit
  pnpm lint-staged
  pnpm turbo run typecheck --affected
  pnpm vitest run --changed HEAD --passWithNoTests
  ```

  This gives ~10-15s pre-commit hooks that catch type errors and test regressions _before_ the commit is created. The key insight is that both Turbo and Vitest do their own change detection — we don't need to wire up file-to-package mapping ourselves.

  For lint-staged specifically, Vitest's `related` subcommand can be used to run only tests that transitively import the staged files:

  ```json
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write",
      "vitest related --run --passWithNoTests"
    ],
    "*.{json,md,yml,yaml}": ["prettier --write"],
    "package.json": ["pnpm install --lockfile-only"]
  }
  ```

  Note: lint-staged passes the staged file paths as arguments to each command, so `vitest related` receives exactly the right files.

- [ ] **Pre-push (optional, belt-and-suspenders)** — if pre-commit already runs affected tests + typecheck, pre-push can run the full suite as a final gate:
  ```bash
  # .husky/pre-push
  pnpm typecheck && pnpm test
  ```
  Full suite is ~14s (tests) + ~20s (typecheck) = ~30s. This is optional if pre-commit is already catching affected issues — the tradeoff is whether you want the full suite locally or are happy to let CI be the backstop for cross-package regressions.

#### Phase 3: Commit Message Conventions

- [ ] **Install commitlint** — `pnpm add -Dw @commitlint/cli @commitlint/config-conventional`
- [ ] **Add commitlint config** — create `commitlint.config.cjs`:
  ```js
  module.exports = { extends: ['@commitlint/config-conventional'] }
  ```
- [ ] **Add commit-msg hook** — `.husky/commit-msg`:
  ```bash
  pnpm commitlint --edit "$1"
  ```
  This enforces the `type(scope): description` format that the repo already uses informally (e.g. `feat(hub): add hub CD pipeline`). Making it formal means changelogs, release notes, and git log filtering all work reliably.

#### Phase 4: ESLint Hardening

- [ ] **Add `eslint-plugin-react-hooks`** — the repo has heavy React usage across 6 packages but no hooks linting. Missing dependency arrays and rules-of-hooks violations are a class of bug that's hard to catch in review.
- [ ] **Promote `no-explicit-any` to error** — currently `warn`, which means it's ignored. Either enforce it or remove the rule.
- [ ] **Add `eslint-plugin-import`** — enforces import ordering conventions from AGENTS.md (type-only first, external, internal, local). Currently the ordering rules exist only in documentation.
- [ ] **Consider `explicit-function-return-type` on exported functions** — AGENTS.md says "Use explicit return types on exported functions" but the ESLint rule is `off`. Could enable it as `['warn', { allowExpressions: true }]` for exported functions only.

#### Phase 5: Nice-to-Haves

- [ ] **Add `.editorconfig`** — ensures consistent indentation/line endings even without Prettier integration in the editor. Trivial to add, zero maintenance.
- [ ] **Add `format:check` script** — `prettier --check .` so developers can verify formatting manually. Currently there's no way to check without the editor.
- [ ] **Add editor tests to root `pnpm test`** — `packages/editor` tests are silently excluded from `vitest run`. Either include them (with `jsdom` env override) or add a separate `test:editor` script and run both in CI.
- [ ] **Turbo-ify linting** — move lint into a per-package Turbo task so it benefits from caching and only re-lints changed packages. Current approach re-lints everything every time.

### Estimated Time Impact on Developer Workflow

| Hook                | What Runs                                                          | Measured Time | Blocking?    |
| ------------------- | ------------------------------------------------------------------ | ------------- | ------------ |
| Pre-commit          | lint-staged (eslint + prettier + `vitest related` on staged files) | 5-8s          | Every commit |
| Pre-commit          | `turbo typecheck --affected`                                       | 3-5s (cached) | Every commit |
| Pre-commit          | `vitest run --changed HEAD`                                        | 5-8s          | Every commit |
| Commit-msg          | commitlint                                                         | <1s           | Every commit |
| Pre-push (optional) | full `pnpm typecheck && pnpm test`                                 | ~30s          | Every push   |

Total pre-commit is **~10-15s** in practice. lint-staged runs first (fast, only staged files), then affected typecheck and tests run. With Turbo caching, repeated commits in the same package are near-instant.

All hooks are bypassable with `--no-verify` for emergencies.

### Why Pre-commit Over Pre-push

Most commits in this repo are made by AI coding agents (Claude Code, etc.), not humans typing `git commit`. This changes the calculus:

- **Agents commit frequently** — they make small, incremental commits as they work. Pre-push hooks only fire once at the end, by which time the agent may have built 5+ commits on top of a broken one.
- **Agents can't check CI** — an agent doesn't monitor GitHub Actions. A failed pre-commit hook gives it immediate, actionable feedback in the same terminal session. A failed CI run requires a human to notice and re-prompt.
- **10-15s is cheap for an agent** — a human might find 15s annoying on every commit, but an agent doesn't care. The cost of _not_ catching an error (broken CI, wasted human time triaging) is much higher.
- **Agents benefit from guardrails** — agents sometimes forget to run `pnpm install` after changing dependencies, or introduce type errors they don't notice. Pre-commit hooks act as an automatic safety net that requires zero agent cooperation.

The key principle: **catch formatting, lint, type errors, and test regressions at commit time (affected only, ~10-15s), and CI is the final backstop for full cross-package validation.**

### CI as Final Backstop

Even with pre-commit hooks, CI should still validate everything since hooks can be bypassed (`--no-verify`). The CI workflow should run:

- `pnpm install --frozen-lockfile` (lockfile integrity)
- `prettier --check` (formatting — not currently in CI at all)
- `pnpm lint` (full lint, not just staged files)
- `pnpm typecheck` (full typecheck across all packages)
- `pnpm test` (full test suite)

This means CI catches anything that slips through locally, but should _rarely_ fail because pre-commit hooks catch most issues first.
