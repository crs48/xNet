# Motion Style Guide

xNet's animation vocabulary. It is deliberately small: the same restraint that
makes the UI feel designed makes motion easy to author consistently — by a
person or an agent. If you can't express an animation with what's below, you're
probably over-animating.

Source of truth: [`packages/ui/src/theme/motion.css`](../packages/ui/src/theme/motion.css).
Enforcement: [`scripts/check-motion-vocab.mjs`](../scripts/check-motion-vocab.mjs)
(runs in CI). Origin: [exploration 0198](explorations/0198_[_]_ELEGANT_COMPOSABLE_MOTION_SYSTEM.md).

## The two laws

1. **Enter is slower and decelerates** — `ease-out`, `duration-normal` (150ms).
2. **Exit is faster and accelerates** — `ease-in`, `duration-fast` (100ms).

Motion that arrives gently and leaves briskly feels intentional. The reverse
feels broken. Every primitive below already bakes this in.

## The vocabulary

### Durations (everyday set in bold)

| Token | Value | Use |
|---|---|---|
| `duration-fast` | **100ms** | hover / press feedback, **exits** |
| `duration-normal` | **150ms** | standard **enter** |
| `duration-slow` | **200ms** | emphasis enter — panels, dialogs, sheets |
| `duration-instant` | 0ms | edge case |
| `duration-slower` | 300ms | large background moves |
| `duration-slowest` | 400ms | rare, dramatic |

### Easings

| Token | Use |
|---|---|
| `ease-out` | **enters** (decelerate in) |
| `ease-in` | **exits** (accelerate away) |
| `ease-in-out` | moves / morphs (something already on screen relocating) |
| `ease-spring` | **direct-manipulation feedback only** — a toggle thumb, a checkbox pop, a drag pickup. Never ambient enters. |
| `linear` | continuous loops (spinner, shimmer, marquee) |

> `ease-bounce` was retired. Its negative anticipation is the opposite of
> "minimal"; `ease-spring` covers everything that should feel springy.

### Primitives

All are compositor-only (`transform` + `opacity`) so they stay at 60fps:

`fade` · `scale` (0.95→1) · `slide-up` · `slide-down` · `slide-left` ·
`slide-right` · `collapse` (height — accordion/disclosure) · `pop` (spring
scale, for direct manipulation) · `shimmer` (skeletons) · `spin` (loaders) ·
`pulse-subtle` (status/attention).

## How to apply motion

### 1. Hover / press / state — Tailwind utilities

```tsx
// Use the shared transition utilities (NOT transition-all).
<button className="transition-base hover:bg-surface-2" />        // colors+opacity+shadow+transform
<button className="transition-colors-fast hover:text-ink-1" />   // color only, fast
<div   className="transition-transform data-[open]:rotate-180" /> // transform+opacity
```

Need a specific property? Name it explicitly: `transition-[width]`,
`transition-[opacity,transform]`. Never `transition-all` — it silently animates
layout properties (`width`/`height`/`top`) off the compositor and janks.

### 2. Open / close of a Base UI component — already done

Dialogs, popovers, tooltips, menus, selects, accordions, switches, checkboxes
animate via [`base-ui-animations.css`](../packages/ui/src/theme/base-ui-animations.css)
(`data-open` / `data-ending-style`). You get enter/exit for free.

### 3. A React conditional that mounts/unmounts — `<Presence>`

For things outside Base UI (toasts, banners, ad-hoc panels), `{open && <X/>}`
can't animate out — the node is gone instantly. Use `<Presence>`:

```tsx
import { Presence } from '@xnetjs/ui'

<Presence show={toast != null} motion="slide-up" wrapperProps={{ role: 'status' }}>
  <ToastBody … />
</Presence>
```

`motion`: `fade` (default) · `scale` · `slide-up` (rises from below — toasts) ·
`slide-down` (descends from above — top banners) · `pop`.

### 4. A list that adds/removes/reorders — `.stagger`

```tsx
<ul className="stagger">
  {items.map((it, i) => (
    <li key={it.id} style={{ '--i': i }}>{it.label}</li>
  ))}
</ul>
```

### 5. A discrete surface / list swap — `useViewTransition()`

```tsx
import { useViewTransition } from '@xnetjs/ui'

const withTransition = useViewTransition()
const reScope = (id: string) => withTransition(() => setCurrentSpace(id))
```

Cross-fades the change via the native View Transitions API; falls back to an
instant swap where unsupported or under reduced motion. Use for discrete,
user-initiated swaps — not high-frequency updates.

## Accessibility

`prefers-reduced-motion: reduce` collapses every animation to ~instant globally
(motion.css). You don't need per-component handling. State still changes; it
just doesn't move. `usePrefersReducedMotion()` is available for custom logic
(`useViewTransition` already uses it).

## When you genuinely need more (the escape hatch)

Drag-coupled motion and FLIP layout animations are the ~5% this vocabulary
doesn't cover. Reach for `motion/react` (LazyMotion + `m`, ~4.6KB shell) **only**
there, and **only behind a lazy/code-split boundary** so it never weighs down
the default bundle. Everything else stays CSS-first.

## For AI agents

When asked to animate something in `apps/web` or `packages/ui`:

- Compose from the tokens and primitives above. Do **not** invent keyframes,
  reach for arbitrary `animate-[…]`, use `transition-all`, write raw
  `duration-<ms>` literals (use `duration-fast|normal|slow`), or use
  `ease-bounce`. `scripts/check-motion-vocab.mjs` fails CI on these.
- Enter → `ease-out` + `duration-normal`. Exit → `ease-in` + `duration-fast`.
- Mount/unmount in React → `<Presence>`. Base UI open/close → already handled.
- Spring is for things the user is directly pushing, nothing else.
- Default to **less**. A single 150ms fade usually beats a bespoke sequence.
