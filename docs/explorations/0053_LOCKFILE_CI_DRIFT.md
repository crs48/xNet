# 0053 - Eliminating Lockfile Drift CI Failures

> **Status:** Exploration
> **Tags:** CI, pnpm, lockfile, frozen-lockfile, DX, git hooks
> **Created:** 2026-02-05
> **Context:** The `electron-release.yml` workflow uses `pnpm install --frozen-lockfile`, which fails when `pnpm-lock.yaml` is out of sync with any `package.json`. This happens regularly because nothing enforces lockfile freshness before code is pushed.

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
