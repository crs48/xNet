---
name: visual-exploration
description: >-
  Build a visual companion to a markdown exploration — wireframes, real
  components, diagrams — rendered in Storybook. Use when an exploration is about
  UI and prose cannot show it, when asked for a mockup or visual plan, or when
  running /explore --visual.
license: MIT
compatibility: Requires pnpm and a local Storybook (pnpm dev:stories, port 6006)
allowed-tools: Bash(pnpm:*) Read Write Edit
metadata:
  source: https://github.com/BuilderIO/agent-native/blob/main/skills/visual-plans/references/wireframe.md
  local-changes: >-
    Wireframe contract adapted for xNet's Storybook renderer and @xnetjs/ui
    token ramp; the hosted Plan MCP, canvas artboards and rough.js sketch
    treatment were dropped.
---

# Visual exploration

A visual exploration is an **MDX companion** to a markdown exploration. It
renders in Storybook against the real design system.

## The split — this is what keeps both files honest

| File                                             | Carries                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `docs/explorations/NNNN_[_]_TITLE.md`            | **Canonical.** Every decision, file path, risk, checklist. |
| `docs/explorations/visuals/NNNN/exploration.mdx` | **Only what pixels can say.**                              |

Neither restates the other. If the MDX starts explaining _why_, it has become a
second source of truth — cut it back. A `.mdx` beside a `.md` is the same
two-source drift that put one rule in both `CLAUDE.md` and `AGENTS.md`.

Most explorations need no visual companion. Protocol, sync, economics and CI
work have nothing to show. Add one only when a reviewer would be misled by prose
alone.

## The tier rule — decide before you write a line

```
Does the UI exist today?
├── No  → Tier W: <Screen>, .wf-* classes.  A sketch.
└── Yes → Tier R: import the real component. The truth.
```

**Never mock speculative UI with real components.** A screenshot of real
`@xnetjs/ui` primitives is indistinguishable from shipped software — that is the
visual form of a false `[x]`. **Never sketch an existing surface**: a wireframe
will happily draw a control the design system cannot build, and the lie only
surfaces at implementation.

The tier is chosen by _what exists_, not by what is convenient.

## Steps

1. `mkdir -p docs/explorations/visuals/<NNNN>` and write `exploration.mdx`.
2. Open with `<Meta title="Explorations/<NNNN> <short title>" />` and a
   `<Callout tone="decision">` linking back to the canonical `.md`.
3. Import from one place:
   ```jsx
   import { Screen, Callout, Diagram, Columns, Column } from '@xnetjs/ui/exploration'
   ```
4. Verify it renders:
   ```bash
   pnpm dev:stories
   ```
   Then open `http://127.0.0.1:6006`, find the page under **Explorations**, and
   check **both** themes with the theme toggle.
5. Link the MDX from the canonical `.md` — `pnpm check:visual-explorations`
   fails if either direction is missing.

## Wireframe rules — the short list

Full contract in [references/wireframe.md](references/wireframe.md). The rules
that get broken most:

- **Never write a hex colour or `font-family`.** Use `--wf-*` tokens; they alias
  the real ramp and flip with the theme.
- **Never use Tailwind or host theme classes** (`bg-white`, `text-slate-400`,
  `shadow-xl`) inside a `<Screen>`. They leak host CSS and break dark mode.
  `pnpm check:visual-explorations` fails on these.
- **Spacing is literal CSS**, never a token: `padding: 16px`, not
  `var(--wf-space-4)`.
- **Match the real footprint.** A sidebar popover is `surface="popover"`, not a
  desktop page plus a phone frame. Emit `mobile` only when responsive behaviour
  actually changes.
- **No shadows.** Mockups are flat bordered surfaces.
- **Icons are markers**: `<span data-icon="mail" aria-label="Email" />`, never
  the visible word "mail".

## Blocks

`@xnetjs/ui/exploration` exports: `Screen`, `Callout`, `Diagram`, `FileTree`,
`AnnotatedCode`, `Columns`, `Column`, `Checklist`, `OpenQuestions`. Field
reference in [references/blocks.md](references/blocks.md); a worked good/bad
example in [references/exemplar.md](references/exemplar.md).

## Don't

- Don't add a visual companion to a non-UI exploration.
- Don't restate decisions, risks or checklists from the `.md`.
- Don't import a real component just to fill a page — Tier R is for existing
  surfaces only.
- Don't add `docs/explorations/**` to the Storybook glob; the narrow
  `visuals/**` glob is what keeps boot time proportional.

## Related

- `explore` — writes the canonical `.md`; `--visual` adds the companion.
- `implement` — flips the checklist in the `.md`, never in the MDX.
