---
name: explore
description: Write a markdown exploration document for a topic, feature idea, architecture question, or research area. Use when asked to "explore X", "research X", "write an exploration", "investigate X", or "do a deep dive on X". Produces a numbered doc in docs/explorations/ with mermaid diagrams, callouts, collapsible sections, status tables, recommendations, and checklists.
---

# Write an exploration

You are an expert autonomous exploration agent. Your mission: write a
thorough markdown exploration of the topic in `$ARGUMENTS` and save it
to `docs/explorations/` following this repo's conventions.

## File naming

Explorations are numbered sequentially with an implementation-status
checkbox embedded in the filename:

```
docs/explorations/NNNN_[_]_TITLE_IN_CAPS.md
```

- `NNNN` — zero-padded sequence number. Compute the next one:

  ```bash
  {
    ls docs/explorations
    git log --all --name-only --format= -- 'docs/explorations/*' | xargs -n1 basename
    ls ../*/docs/explorations 2>/dev/null
  } | sed -n 's/^\([0-9]\{4\}\)_.*/\1/p' | sort -n | tail -1 | awk '{printf "%04d\n", $1+1}'
  ```

  **Scan every ref, not just the working tree.** Numbers are claimed when a
  doc is written, not when it merges, so unmerged branches and sibling
  worktrees hold numbers `ls docs/explorations` cannot see — exploration 0410
  found seven stranded that way. A working-tree-only check hands out a number
  someone else is already using.

- `[_]` — always start unchecked. The box tracks implementation
  status and is renamed later by `/implement`:
  - `[-]` — **partially implemented**: some checklist items are
    checked but work remains (commit message:
    `docs(exploration): partially check off <topic>`).
  - `[x]` — **fully implemented**: every checklist item is checked
    (commit message: `docs(exploration): check off <topic>`).
- `TITLE_IN_CAPS` — short title, UPPERCASE, words joined by
  underscores (e.g. `0153_[x]_SOCIAL_DATA_WORKSPACE_UI.md`). Prefer a
  distilled title over echoing the prompt verbatim.

## Research before writing

Be thorough — the document must be grounded in reality, not vibes:

1. **Search the codebase.** Find the actual files, packages, and seams
   the topic touches. Cite real paths (e.g.
   `apps/web/src/components/DataWorkspaceView.tsx`,
   `packages/social/src/lenses/graph-lenses.ts`) so the exploration
   connects to the code as it exists today.
2. **Search the web** for prior art, libraries, benchmarks, and
   tradeoff analyses relevant to the topic.
3. **Be creative** — explore multiple angles, perspectives, and
   competing options before recommending one.

## Document structure

Recent explorations converge on this skeleton — follow it unless the
topic clearly demands otherwise:

```markdown
---
title: <Title>
status: draft # mirrors the [_]/[-]/[x] filename checkbox
last_updated: YYYY-MM-DD
tags: [<area>, <area>]
---

# <Title>

> [!TIP]
> **TL;DR** — one- or two-sentence summary of the recommendation, so a
> reader can stop here.

## Problem Statement

## Executive Summary

## Current State In The Repository ← cite real file paths

## External Research ← web findings, prior art

## Key Findings

## Options And Tradeoffs ← multiple angles, compared

## Recommendation

## Example Code ← if applicable

## Risks And Open Questions

## Implementation Checklist ← - [ ] items, concrete steps

## Validation Checklist ← - [ ] items, how we know it worked

## References
```

Requirements:

- **Mermaid diagrams** — include a variety where appropriate
  (flowcharts, sequence diagrams, ER diagrams, state diagrams).
  Nearly every exploration in this repo has at least one.
- **Recommendations** — end with a clear recommended path and concrete
  next steps, not just a survey.
- **Checklists** — every implementation and validation step as
  `- [ ]` items, so progress can be tracked and the file eventually
  checked off.
- **Styling toolkit** — use the markdown features below to give the
  document visual hierarchy. A long exploration with no callouts, no
  collapsibles, and no status tables is under-formatted.
- **Revenue lanes** — if the exploration proposes a new way xNet makes
  money, apply the three "No ground rent" tests from
  `docs/CHARTER.md` §6 (improvement / BATNA / vanish) explicitly in the
  Options and Recommendation sections (exploration 0351).

## Styling toolkit

These docs are read on GitHub, so stick to GitHub-flavored markdown.
Use these features deliberately — each earns its place by making the
document easier to scan, not prettier for its own sake.

### Callouts (biggest legibility win)

GitHub alert syntax. Use them to lift key sentences out of the prose —
roughly one per major section, not one per paragraph:

```markdown
> [!NOTE] background context worth flagging
> [!TIP] recommended approach; also the TL;DR at the top
> [!IMPORTANT] the load-bearing fact or decision
> [!WARNING] something that will bite (gotchas, footguns)
> [!CAUTION] higher-stakes / irreversible risk (one-way doors)
```

Reserve `[!WARNING]`/`[!CAUTION]` for real hazards so they keep their
signal. A mermaid diagram inside a callout is fine and reads well.

### Collapsible sections

Keep the main narrative tight; fold secondary depth into
`<details>` so the reader opts in:

```markdown
<details>
<summary>Full benchmark output / detailed derivation / raw notes</summary>

Tables, code blocks, and mermaid diagrams all work inside.
Keep the blank line after <summary> — GitHub needs it to render
markdown inside the block.

</details>
```

Good candidates: long code listings, raw research notes, per-file
survey tables, the "why not option C" digression. Never hide the
Recommendation or the checklists in one.

### Status tables

When comparing options or surveying current state, add an emoji
status column — it makes the table scannable at a glance:

```markdown
| Component   | Status      | Notes                 |
| ----------- | ----------- | --------------------- |
| Wire format | ✅ Shipped  | #623                  |
| Panel UI    | 🚧 Partial  | approval flow missing |
| ACP adapter | ❌ Blocked  | API-key only upstream |
| FUSE mirror | 🛑 Rejected | Logseq lesson (0393)  |
```

In the Implementation Checklist, an optional progress line helps
long-running explorations: `**Status:** ███████░░░ 7/10 items`.

### Small-scale emphasis

- `<kbd>Cmd</kbd> + <kbd>K</kbd>` for keys and UI chrome.
- `<mark>highlighted phrase</mark>` for the one term a section hinges
  on (GitHub does **not** render `==highlight==` — use `<mark>`).
- Math renders natively: inline `$O(n \log n)$`, block `$$ … $$` —
  use it for complexity, capacity, or cost formulas instead of prose.
- `---` horizontal rules between major acts of a long document
  (research → findings → recommendation), not between every section.
- An emoji in a heading is fine sparingly (`## 🧭 Architecture
overview`) — at most a few per document, never on every heading.

### ASCII box drawings

When a full mermaid diagram is overkill (a 3-box pipeline, a
directory layout), a fenced ASCII sketch is lighter and diffs better:

```text
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Input   │ ──▶ │ Process  │ ──▶ │  Output  │
└──────────┘     └──────────┘     └──────────┘
```

Prefer mermaid once there are branches, cycles, or more than ~5 nodes.

### Combinations that work well

- Mermaid diagram → collapsible "Detailed walkthrough" right under it.
- `[!IMPORTANT]` callout stating the decision → status table of the
  options it was chosen from.
- TL;DR callout + frontmatter at the top; checklists + progress line
  at the bottom — the document scans end-to-end without reading prose.

## Visual companions (`--visual`)

When the topic is fundamentally about **interface** — a layout, a control's
placement, whether something survives at 320px — prose and mermaid cannot show
it. Invoke the **`visual-exploration`** skill to add an MDX companion at
`docs/explorations/visuals/NNNN/exploration.mdx`, rendered in Storybook against
the real design system (exploration 0403).

This is **opt-in**. Add a companion only when a reviewer would be misled by
prose alone. Protocol, sync, economics and CI explorations have nothing to show,
and a companion for them is pure overhead.

Two rules carry over into the markdown doc:

- **The `.md` stays canonical.** Every decision, file path, risk and checklist
  lives here; the MDX carries only what pixels can say. If the MDX starts
  explaining _why_, it has become a second source of truth. Link to it from this
  doc — `pnpm check:visual-explorations` fails if either direction is missing.
- **The tier rule.** UI that does not exist yet is a wireframe (`<Screen>`); a
  change to a surface that already ships imports the real component. A
  screenshot of real primitives is indistinguishable from shipped software.

## Committing

Commit the new doc with:

```
docs(exploration): explore <topic>
```
