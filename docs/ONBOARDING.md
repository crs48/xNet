# Onboarding coachmarks

Light, non-blocking, first-run tips (exploration
[0206](explorations/0206_%5B_%5D_LIGHT_EXTENSIBLE_ONBOARDING_AND_FIRST_RUN_COACHMARKS.md)).
One tip at a time, shown the first time you open a view, dismissible, and
replayable from **Settings → Tips & tours**. This is _not_ a product tour — it
is the contextual-coachmark pattern that research and tasteful tools converge
on.

The engine lives in [`apps/web/src/coachmarks/`](../apps/web/src/coachmarks).
It is a near-twin of the "What's New" plumbing: a "seen" set persisted in the
workbench store (`xnet:workbench:v1`), plus a declarative registry.

## Add a tip

A tip is a small object in a declarative registry. Register it with
`contributeTips()` — at module load is fine (idempotent):

```ts
import { contributeTips } from '../coachmarks'

contributeTips([
  {
    id: 'crm:filters@1', // stable + versioned; bump @n to re-surface after a rewrite
    view: 'crm', // a value from viewIdForPath() — fires on first visit to this view
    anchor: '[data-coach="rail.crm"]', // CSS selector for the element to point at
    title: 'Filter your contacts',
    body: 'Segment contacts by tag, deal stage, or last activity.',
    side: 'right' // top | right | bottom | left (default bottom)
  }
])
```

That is the whole extensibility story: **features and bundled plugins bring
their own tips; the engine never changes.** Core seeds live in
[`tips.ts`](../apps/web/src/coachmarks/tips.ts).

### Rules of thumb

- **Keep it short.** Title ≤ ~40 chars, body ≤ ~140. One idea per tip.
- **Version the id** (`@1`, `@2`). Bumping the suffix re-shows the tip once to
  everyone — use it when you rewrite the copy, not for unrelated edits.
- **Prefer stable anchors.** Use an existing `[data-coach="…"]` (see the Rail)
  or a shell region (`[data-wb-region="…"]`). If the anchor isn't in the DOM,
  the tip silently waits for a later visit — it never errors.
- **One per view, usually.** The engine serializes tips app-wide and surfaces
  at most ~2 brand-new tips per session, so a view rarely needs more than one.

## Add an anchor

A tip can only point at an element that exists. The Rail buttons expose
`data-coach="rail.<id>"` (search, crm, discover, tasks, …). To anchor to
something new, add a `data-coach="…"` attribute to that element and reference it
from the tip's `anchor`.

## How it fits together

```
viewIdForPath(pathname) ──▶ useCoachmarks(view) ──▶ Coachmark (portal + Presence)
        route                  registry +                non-modal card,
       segment              seenTips (store)            Esc / ✕ / "Got it"
```

- [`registry.ts`](../apps/web/src/coachmarks/registry.ts) — pure tip registry
  (`contributeTips`, `tipsForView`, `selectUnseenTips`).
- [`views.ts`](../apps/web/src/coachmarks/views.ts) — `viewIdForPath()` maps a
  route to a stable view id.
- [`useCoachmarks.ts`](../apps/web/src/coachmarks/useCoachmarks.ts) — picks the
  one tip to show, serializes app-wide, caps per session, writes "seen" on
  dismiss.
- [`Coachmark.tsx`](../apps/web/src/coachmarks/Coachmark.tsx) — the non-modal,
  portalled card. Deliberately not a Base UI Popover: a coachmark must never
  trap focus or block the app.
- [`CoachmarkLayer.tsx`](../apps/web/src/coachmarks/CoachmarkLayer.tsx) — mounted
  once from the Workbench; dormant until first-run setup is done
  (`hasOnboarded()`).

## Reduced motion & accessibility

The card animates in via the shared `<Presence>` vocabulary, so
`prefers-reduced-motion` is honored automatically (handled globally in
`packages/ui/src/theme/motion.css`). The card is a `role="dialog"` labelled by
its title, and is dismissible with Escape.

## Reset / replay

`resetTips()` on the workbench store clears the dismissed set;
`resetCoachSession()` clears the per-session cap so tips reappear immediately.
**Settings → Tips & tours → Replay onboarding** calls both.
