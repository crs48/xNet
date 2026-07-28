---
name: verification-before-completion
description: >-
  Requires fresh command output before any claim that work is done, tests pass,
  or a checklist item is complete. Use before writing [x] on an exploration
  checklist, before renaming an exploration's filename checkbox, before
  committing, and before opening or merging a PR.
license: MIT
compatibility: Requires pnpm, turbo and git
allowed-tools: Bash(pnpm:*) Bash(turbo:*) Bash(git:*) Read
metadata:
  source: https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md
  local-changes: >-
    Evidence table rewritten for xNet's commands and the [x] filename
    convention; the original's rationalization tables were cut.
---

# Verification before completion

## The gate

**No completion claim without fresh verification evidence in this message.**

If you have not run the command in this turn, you cannot say it passes.

## Evidence table

| Claim                     | What proves it                                          | Not sufficient                                                     |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Tests pass                | `pnpm test` output, 0 failures                          | A previous run; "should pass"                                      |
| One package's tests pass  | `pnpm exec vitest run --project <name> <path>`          | `pnpm --filter <pkg> test` — the root config runs every project    |
| Types clean               | `pnpm turbo run typecheck` exit 0                       | `tsc` on one file                                                  |
| Lint clean                | `pnpm lint` exit 0                                      | The editor showing no squiggles                                    |
| A checklist item is `[x]` | The named artifact exists **and is wired** — re-read it | The edit succeeded                                                 |
| An exploration is `[x]`   | Every item verified individually                        | "most of it landed"                                                |
| A feature shipped         | It runs in the app                                      | It compiled. 0376/0377/0394 each record work built and never wired |
| A subagent finished       | `git diff --stat` shows the change                      | The agent's success report                                         |
| CI is green               | `gh pr checks <N>` output                               | The last run; a green check on an older commit                     |

## Why this exists here

Exploration 0397 recorded **five falsely-checked `[x]` items** in a single plan.
0376, 0377 and 0394 each record work that was built but never wired. A false
`[x]` is worse than an unchecked box: `/implement` and every later agent read
the checkbox as ground truth and build on top of it.

## When a claim fails

Say what actually happened, with the output. A partial result reported plainly
is useful; a partial result rounded up to "done" costs someone a debugging
session later.

If a check is genuinely unrunnable here (an interactive command, a missing
credential), say that it was not run — do not check the box and do not imply it
passed.

## Related

- `implement` — flips checklist boxes; this is the gate before each flip.
