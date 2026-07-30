# Good vs bad

## GOOD — a nav consolidation

Opens with a `<Callout tone="decision">` linking to the canonical `.md`. Then
**Today**: the real `LensChips` component, because it ships — so the frame
cannot claim a capability the design system lacks. Then **Proposed**: a
`<Screen surface="panel">` whose body is a real flex layout with the actual
project names, an accent `.wf-pill` for the active lens, plain pills for the
others, a `button.primary` with a `data-icon="plus"` marker, and one `.wf-card`
row carrying a real title and a real "4 open · updated 2h ago". A short
`<Columns>` weighs the two placements that were genuinely considered. No
decisions, no risks, no checklist — those live in the `.md`.

## GOOD — an architecture review

No `<Screen>` at all. Each recommendation carries its own local `<Diagram>` and
a `<FileTree>` of the real paths it touches. Better than one big top diagram
because each is adjacent to the claim it supports.

## BAD

A `<Screen>` with `style="background:#fff"` and a `font-family`; grey
placeholder bars standing in for text; a forced `desktop` **and** `mobile` pair
for a popover; `class="bg-zinc-50 shadow-lg"` inside the frame; the word
"search" where the product shows an icon; `padding: var(--wf-space-4)` that
resolves to nothing and collapses the layout; a real `<Button>` used to mock a
screen that does not exist yet; and — worst — a "Risks" section restating the
`.md`. Never produce this.
