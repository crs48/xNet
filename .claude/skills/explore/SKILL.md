---
name: explore
description: Write a markdown exploration document for a topic, feature idea, architecture question, or research area. Use when asked to "explore X", "research X", "write an exploration", "investigate X", or "do a deep dive on X". Produces a numbered doc in docs/explorations/ with mermaid diagrams, recommendations, and checklists.
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
  ls docs/explorations | sed -n 's/^\([0-9]\{4\}\)_.*/\1/p' | sort -n | tail -1 | awk '{printf "%04d\n", $1+1}'
  ```

- `[_]` — always start unchecked. It is renamed to `[x]` later, when
  the exploration's recommendations have been implemented (commit
  message: `docs(exploration): check off <topic>`).
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
# <Title>

## Problem Statement
## Executive Summary
## Current State In The Repository   ← cite real file paths
## External Research                 ← web findings, prior art
## Key Findings
## Options And Tradeoffs             ← multiple angles, compared
## Recommendation
## Example Code                      ← if applicable
## Risks And Open Questions
## Implementation Checklist          ← - [ ] items, concrete steps
## Validation Checklist              ← - [ ] items, how we know it worked
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

## Committing

Commit the new doc with:

```
docs(exploration): explore <topic>
```
