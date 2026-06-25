---
name: implement
description: Autonomously implement what was just written — an /explore exploration, a plan, or a spec in the conversation. Use when the user says "implement it", "build it", "ship it", "do it", "make it so", "implement this exploration/plan", or "this looks good, go". Works on a new branch, checks off checklist items and commits as it goes, opens a PR, and merges to main.
---

# Implement it

Take whatever was just written — usually an `/explore` doc in
`docs/explorations/`, sometimes a plan or spec in the conversation — and
**build the whole thing**: new branch, check off each checklist item and
commit as you go, open a PR, get it green, merge to `main`. Aim to
complete everything, not a slice.

> The spirit: _"This looks good. Implement it. Work on a new branch,
> check off checklist items and commit as you go. Make a PR when
> everything is complete and merge it into main. Try to complete
> everything."_

The bookkeeping (find the doc, track checklist progress, flip boxes,
mark the doc done) is handled by a zero-dep driver. **You** write the
code; the driver is your hands for the mechanical parts.

> Paths below are relative to the **repo root**. The driver lives at
> `.claude/skills/implement/driver.mjs`.

## The loop

1. **Identify the spec.** If it's an exploration, get its path:
   ```bash
   node .claude/skills/implement/driver.mjs find        # highest-numbered unimplemented [_] doc
   node .claude/skills/implement/driver.mjs find turso  # or match by number/title
   ```
   If the spec is a conversation plan or some other doc, use that as the
   checklist source instead — the rest of the loop is identical (skip the
   doc-rename in step 6).
2. **Branch.** Off the latest `main`:
   ```bash
   git fetch origin && git switch -c "$(node .claude/skills/implement/driver.mjs branch <doc>)" origin/main
   ```
3. **See what's left** and work the items top to bottom:
   ```bash
   node .claude/skills/implement/driver.mjs status <doc>
   ```
4. **For each Implementation item:** write the code (read neighbors
   first, match the package's patterns), then prove it — `pnpm --filter
<pkg> test`, `pnpm typecheck`. When it's actually done, flip the box
   and commit:
   ```bash
   node .claude/skills/implement/driver.mjs check <doc> "Add a per-cell lock"
   git add -A && git commit -m "feat(scope): <what landed>"
   ```
   One commit per item (or per coherent group). Conventional-commit
   prefixes are enforced by `commit-msg`.
5. **Validation checklist:** run each check, flip its box as it passes.
6. **Mark the doc done** once `status` shows 0 remaining (skip if the
   spec wasn't an exploration):
   ```bash
   node .claude/skills/implement/driver.mjs done <doc>   # renames [_] -> [x], prints the commit msg
   git add -A && git commit -m "docs(exploration): check off <topic>"
   ```
7. **Ship it** — see below.

## Setup (once per fresh worktree)

`node_modules` is usually **absent** in a worktree. The driver and
changelog script are zero-dep, but `pnpm test`/`typecheck`/`lint` need:

```bash
pnpm install --frozen-lockfile --prefer-offline   # ~18s
```

## Driver commands

```
find [query]              highest-numbered [_] doc, or match by number/title
status <doc>              Implementation/Validation progress + remaining items
check <doc> "<substring>" flip the one unchecked item containing <substring>
done  <doc>               rename [_] -> [x] (refuses if any box is unchecked)
branch <doc>              suggest a branch name (claude/NNNN-slug)
```

`check` and `find` **error on ambiguity** — pass a longer, unique
substring (or the full number) and they resolve.

## Ship it (PR + merge to main)

Every PR must satisfy the `changelog-section` required check. Add a
user-facing fragment (or the `skip-changelog` label for pure
refactors/chores/CI):

```bash
node scripts/changelog/new.mjs --title "Deals now sync after import" \
  --summary "Importing contacts no longer creates duplicate deals." --tags crm
git add -A && git commit -m "docs(changelog): add fragment"
```

Valid `--tags`: `app, crm, finance, tasks, ai, plugins, editor, sync,
identity, platform, performance, devtools, ci`.

Push, open the PR, wait for the required checks, merge:

```bash
git push -u origin HEAD            # add --no-verify only if a known-flaky pre-push hook blocks
gh pr create --fill
gh pr checks <N> --watch           # required: editor-ux, lint, test (1/3..3/3), typecheck, changelog-section
gh api --method PUT repos/{owner}/{repo}/pulls/<N>/merge -f merge_method=merge
```

**Only merge-commit is allowed** (`--squash`/`--rebase` → 405). The
branch auto-deletes on merge. After merging, switch back and pull:

```bash
git switch main && git pull origin main
```

If `main` moved while the PR was open the branch goes **BEHIND** (strict
checks) and the merge is blocked. Either update the branch
(`gh pr update-branch <N>` or merge `main` in and push) and re-wait for
checks, or — **only if you are the repo owner/admin** (a ruleset bypass
actor) — admin-merge past it:

```bash
gh pr merge <N> --merge --admin
```

## Gotchas

- **Merge method is merge-commit only.** The "Protect main" ruleset sets
  `allowed_merge_methods: ["merge"]`. `gh pr merge --squash`/`--rebase`
  → HTTP 405. Always `merge_method=merge`.
- **Strict required checks** mean the branch must be **up to date with
  main** to merge. A long-running PR will need a branch update before it
  goes green. Owner/admin is a bypass actor and can admin-merge.
- **`gh pr merge --delete-branch` can fail when the main worktree is
  checked out.** Use the `gh api ... PUT .../merge` form above;
  `delete_branch_on_merge` is on, so the branch is cleaned up anyway.
- **`core.bare` sometimes flips to `true` mid-session** in this repo;
  git then errors `this operation must be run in a work tree`. Fix:
  `git config core.bare false`.
- **Pre-push hooks run `pnpm typecheck && pnpm test` (~30s) and flake**
  on the full suite. AGENTS.md says never `--no-verify`; in practice a
  known unrelated flake is the one time it's justified — CI's required
  checks are the real gate, so the PR still can't merge broken. Don't
  use it to skip a failure your change actually caused.
- **`docs(exploration): check off <topic>`** is the conventional message
  for the `[_]`→`[x]` rename; `done` prints the exact line.
- **Don't add scope beyond the checklist.** Implement the doc; resist
  gold-plating (AGENTS.md "DON'T: add features beyond what's requested").

## Troubleshooting

- `error: cannot read docs/explorations` — you're not at the repo root.
  `cd` to the repo root; driver paths are root-relative.
- `ambiguous — N matches` from `find`/`check` — pass a longer unique
  substring, or the 4-digit number for `find`.
- `refusing: N checklist item(s) still unchecked` from `done` — finish
  (or `check`) the listed items first; `done` won't mark a half-built
  doc complete.
- `No valid tags` from `new.mjs` — use a tag from the list above.
- `changelog-section` check failing — the PR has no fragment and no
  `skip-changelog` label. Add one of them.
