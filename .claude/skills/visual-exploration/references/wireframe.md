# Wireframe quality — the full contract

Adapted from BuilderIO/agent-native (MIT). Their renderer owned a hand-drawn
font and a rough.js sketch overlay; xNet's renderer is Storybook plus the real
token ramp, so the _aesthetic_ rules are dropped and the _honesty_ rules kept.

## The contract

**A wireframe is an HTML mockup. The renderer owns the look; you write the
content.** Put semantic HTML inside `<Screen>` and set `surface`. You never
write `<html>`/`<body>`/`<style>` tags, and never width/height/coordinates —
the surface preset owns the footprint.

## Bare elements are auto-themed

`h1`–`h3`, `p`, `small`, `button`, `input`, `select`, `textarea`, `a`, `hr` need
no classes. Helper classes carry the rest:

| Class                                | Renders                                       |
| ------------------------------------ | --------------------------------------------- |
| `.wf-card` / `.wf-box`               | bordered, padded container (panel, list item) |
| `.wf-pill` / `.wf-chip`              | rounded tag or filter; add `.accent` to fill  |
| `.wf-muted`                          | secondary text                                |
| `button.primary` or `[data-primary]` | accent-filled primary button                  |

## Colour: tokens only, never hex

Every `--wf-*` aliases `packages/ui/src/theme/tokens.css`, so reading them is
what keeps a mockup correct in light, dark and true-black:

`--wf-ink` (text) · `--wf-muted` (secondary) · `--wf-line` (borders) ·
`--wf-paper` (Plane A, `--canvas`) · `--wf-card` (Plane B, `--island-b`) ·
`--wf-accent` / `--wf-accent-fg` / `--wf-accent-soft` · `--wf-warn` · `--wf-ok` ·
`--wf-radius`

Never hard-code a hex. Never set `font-family`.

## Never use host theme classes

`bg-white`, `bg-zinc-50`, `text-slate-400`, `border-zinc-200`, `shadow-xl`,
`bg-[#fff]` — these leak the host app's CSS into the mockup and make dark-mode
frames unreadable. This is the same failure `scripts/check-surface-tokens.mjs`
guards against in product code (0299). `pnpm check:visual-explorations` fails on
them here.

Before finishing, scan every `class` and `style` in the screen: if it sets a
background, text, border, ring, fill, stroke, gradient or shadow colour, rewrite
it to a token or delete it. Inline flex/grid styles are preferred over classes
for layout — easier to review.

## Spacing is literal, not tokenised

`--wf-*` is colour-only. Write `padding: 16px`, `gap: 12px`,
`grid-template-columns: minmax(0,1fr)`. A guessed spacing token
(`var(--wf-space-4)`) does not resolve, padding collapses, and content hugs the
border.

## No decorative depth

No `box-shadow`, no `filter: drop-shadow()`, no Tailwind `shadow-*` on a frame,
`.wf-card` or root container. Mockups read as flat bordered surfaces; use
spacing, borders and labels for separation. `wireframe.css` neutralises shadows
defensively, but do not rely on that.

## Surface presets — match the real footprint

| `surface` | Use for                                                 |
| --------- | ------------------------------------------------------- |
| `browser` | a web page needing browser chrome                       |
| `desktop` | a full desktop app page or shell                        |
| `mobile`  | a phone screen — only when the work is genuinely mobile |
| `popover` | a small floating menu, dropdown or inline popover       |
| `panel`   | a side panel, inspector or sidebar widget               |

A sidebar popover renders as a small surface, not a desktop page **and** a phone
frame. Emit `desktop` + `mobile` only when responsive behaviour actually changes
the layout.

Reserve `Diagram` for architecture, dependency, state and data-flow
relationships. A rendered UI change belongs in a `<Screen>`.

## Icons are markers

Write `<span data-icon="mail" aria-label="Email" />` for an icon-only button or
a leading icon. The renderer swaps in a lucide SVG sized to the surrounding
text. Never put the visible word "mail", "search", "chevron" or "more" where the
product would show an icon.

Supported names: `mail`/`email`, `lock`/`password`, `search`, `plus`/`add`,
`x`/`close`, `check`, `chevronDown`/`chevron`/`caret`/`dropdown`, `chevronUp`,
`chevronLeft`, `chevronRight`, `dots`/`more`, `user`, `settings`, `calendar`,
`bell`, `send`, `edit`, `arrowLeft`, `arrowRight`.

An unknown name warns to the console and stays visible — a missing icon you can
see beats one that vanished.

## Real content, not lorem

Reproduce the actual screen, then show the modification. Real labels, real
counts, real dates, real button text grounded in the surface you read. Never
grey placeholder bars on a non-skeleton frame.
