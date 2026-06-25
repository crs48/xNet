# UI accents — the "tasteful performative UI" set

These components (exploration `0223`) bring a curated subset of
[`performative-ui`](https://github.com/vorpus/performativeUI) (MIT) motion/visual
tropes onto the marketing site. `performative-ui` is _satire_ of AI-startup
landing pages; we borrow the **craft**, not the cynicism, and only where xNet has
real substance to amplify.

## The five-gate test

An accent ships **only if it passes all five**. When in doubt, cut it.

1. **It amplifies something true.** Count up a real number, draw the real P2P
   mesh, show a real before/after — never decoration that implies a claim we
   can't back.
2. **It stays on-palette and dark-first.** indigo / purple / emerald / amber /
   pink on the existing surfaces; works in both themes.
3. **It has a static fallback.** Everything degrades to a sensible no-motion,
   no-JS state via `prefersReducedMotion()` (see `src/lib/motion.ts`).
4. **One focal moment per viewport.** Ambient backgrounds may coexist, but two
   competing focal animations in one section is the slop we're avoiding.
5. **It's perf-safe.** No React/hydration islands — pure Astro + CSS + a few KB
   of vanilla JS; canvas loops cap node count/DPR and pause when offscreen.

## What's here

| Component | Role | Where |
| --- | --- | --- |
| `StatCounter.astro` | count-up on scroll | Community facts, `/open` metrics |
| `NodeGraphBackground.astro` | ambient P2P mesh (canvas) | protocol / hubs / vision |
| `Aurora.astro` | drifting gradient blobs | hero, vision |
| `WordRoll.astro` | one rolling word | hero subhead |
| `MockIDE.astro` | window-chrome code surface (+ optional type-in) | SDK / agent code |
| `BeforeAfter.astro` | draggable comparison slider | `/compare` |
| `StatusDot.astro` | honest status dot (real `status.json`) | nav |
| `LogoRow.astro` | "built on open standards" wordmarks | how-it-works |
| `Sparkle.astro` | single ✦ accent | one eyebrow only |
| `GradientText.astro` | gradient-clipped text | eyebrows, sparingly |

All motion respects `prefers-reduced-motion`. Shared helpers:
`src/lib/motion.ts`. Skipped (off-brand / gag-only) `performative-ui`
components and the full rationale: see
`docs/explorations/0223_[x]_TASTEFUL_PERFORMATIVE_UI_ON_THE_MARKETING_SITE.md`.
