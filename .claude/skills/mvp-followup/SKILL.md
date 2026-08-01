---
name: mvp-followup
description: >-
  Decide what to close out after a feature pass without inventing new scope. Use
  when asked "what's next", after a feature lands, or before calling a thread
  finished.
license: MIT
metadata:
  source: https://github.com/BuilderIO/agent-native/blob/main/.agents/skills/mvp-followup/SKILL.md
---

# MVP follow-up

## Rule

Recommend only closeout work that makes what already exists **more real,
verified, documented, or shippable**. Do not propose new product scope unless
something genuinely blocks the current work from being used.

## Look for gaps in this order

1. Failing or skipped verification — a check nobody ran
2. Work that was built but never wired (0376/0377/0394 all record this)
3. Docs or instructions that no longer match behaviour
4. A checklist item marked `[x]` on assumption rather than evidence
5. Unrelated dirty files blocking a clean ship

## Choosing among stale explorations

`docs/explorations/STALE.md` lists every document past its `review:` date, and
opens with the backlog's **retirement curve** (exploration 0430). Read the curve
before the list: it does not fall, so an old `[_]` is not work in progress — it
is a decision already made by inaction. Withdrawing one (`status: withdrawn`) is
a legitimate closeout and often the honest answer; renewing it (`review:`) is the
other. Neither renames the file. Proposing to _start_ a 120-day-old document is
new scope, not follow-up.

## Output shape

Lead with the concrete next step. Keep it short, and separate:

- **Do now** — verification, docs, or a bug fix that closes a real gap
- **Defer** — useful ideas that should wait for actual use
- **Blocked** — anything needing a human decision or credential

## Skip the tempting bloat

New integrations, dashboards, settings panels, abstractions, and extra UI are
not closeout work. If it would need its own exploration, it is not follow-up.

## Related

- `verification-before-completion` — gap #1 and #4 are usually this
