---
name: babysit-pr
description: >-
  Drive a PR to green — fix CI failures and answer every review comment until
  checks pass and nothing is unaddressed. Use when asked to babysit, watch, or
  land a PR.
license: MIT
compatibility: Requires gh and a GitHub remote
allowed-tools: Bash(gh:*) Bash(git:*) Bash(pnpm:*) Read
metadata:
  source: https://github.com/BuilderIO/agent-native/blob/main/.agents/skills/babysit-pr/SKILL.md
  local-changes: >-
    Merge section rewritten for xNet policy (merge-commit only, no --admin);
    changeset handling delegates to the /changeset skill; the stash-handling and
    30-minute soak rules were cut.
---

# Babysit a PR

Find the PR if not given: `gh pr list --head "$(git branch --show-current)" --state open`.

## Each pass

**1. Push anything local first.**

```bash
git status --short && git log --oneline @{u}..HEAD
```

**2. Check CI.**

```bash
gh pr checks <N>
```

Required: `lint`, `test (1/3..3/3)`, `typecheck`, `editor-ux`,
`changelog-section`. Others are informational — `capture` and `deploy-preview`
are `continue-on-error` and must never block a merge.

**3. Find unaddressed review comments by reply state, never by timestamp.**

A "comments since `<time>`" filter silently skips rounds posted before your last
reply, and reads as "all addressed" when it is not. Review bots re-review on
every push, so a PR accumulates several rounds.

```bash
gh api --paginate repos/{owner}/{repo}/pulls/<N>/comments --jq '.[]' \
  | jq -s '
    ([ .[] | .in_reply_to_id // empty ]) as $replied
    | .[]
    | select((.in_reply_to_id // null) == null)
    | select(.id as $id | ($replied | index($id)) | not)
    | {id, user: .user.login, path, line: (.line // .original_line), snippet: (.body[0:200])}'
```

Anything it prints is unaddressed. Also re-read the review bodies — bots restate
findings there:

```bash
gh api repos/{owner}/{repo}/pulls/<N>/reviews --jq '.[] | select(.body != "") | {user: .user.login, state, body: .body[0:800]}'
```

## Fixing

- **A required check is red** → read the log (`gh run view --job <id> --log-failed`),
  fix the cause, push. Reproduce locally first when you can; a fix you have not
  seen pass is a guess.
- **Missing changeset** → invoke the `changeset` skill. Do not hand-write one.
- **Missing changelog** → invoke the `changelog` skill, or apply
  `skip-changelog` if the change is genuinely internal.
- **Branch is BEHIND** → `git merge origin/main` and push. Required checks are
  strict; a stale branch cannot merge.

## Answering feedback

Every human or bot comment gets a reply — a fix or a reason for skipping. Fixing
marks a comment outdated in the UI, which is not the same as answering it.

Be skeptical of the feedback itself. Skip, with a reply saying why: pre-existing
issues, false positives, nitpicks, style the linter already owns. Fix real bugs
introduced by the PR, security issues, and data-loss risks — regardless of who
wrote the line.

## Merging

**Never merge unless asked.** When asked, all of these must hold:

1. `git status --short` empty and nothing unpushed
2. every required check green **on the current head**
3. every review comment answered — re-run the query above as the final gate
4. `gh pr view <N> --json mergeStateStatus` is `CLEAN`

```bash
gh api --method PUT repos/{owner}/{repo}/pulls/<N>/merge -f merge_method=merge
```

Merge-commit only — `--squash`/`--rebase` return 405. **Do not use `--admin`**:
this repo's standing preference is to wait for green CI rather than bypass it.

## Related

- `verification-before-completion` — "CI is green" needs fresh output
- `changeset`, `changelog` — the two checks that most often block a PR
