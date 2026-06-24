# Building with xNet `@xnetjs/ui`

A shadcn-style kit: monochrome HSL design **tokens**, `class-variance-authority`
variants, Tailwind utilities, light/dark. Import components from the bundle
(`window.XNetUI.*`); compose them and add layout with the DS's own token utilities.

## Setup & theming
- Tokens, fonts, and component CSS all load through `styles.css` — the look is global,
  so there's nothing to import per component.
- **Theme-aware components need a `ThemeProvider`.** Anything that reads theme (e.g.
  `ThemeToggle`) throws without one. Wrap the app root:
  `<ThemeProvider defaultTheme="light">…</ThemeProvider>` (`"light" | "dark" | "system"`).
  Dark mode is the `.dark` class on `<html>` (ThemeProvider manages it); to force a dark
  subtree, put `className="dark"` on a wrapper.
- Fonts: sans = **Inter** (`font-sans`, the default), mono = **Geist Mono** (`font-mono`,
  for code, ids, and numeric cells).

## Styling idiom — token utilities, never raw colors
Style with the **semantic token classes** below (they carry light/dark + brand); never
hard-coded hex or stock Tailwind palette colors.
- **Surfaces**: `bg-background` (page), `bg-background-subtle`, `bg-background-muted`,
  `bg-card`, `bg-muted`, elevation ramp `bg-surface-0|1|2`. Accent fills: `bg-primary`,
  `bg-secondary`, `bg-accent`, `bg-destructive`, `bg-success`, `bg-warning` (each + `-muted`).
- **Text**: `text-foreground` (primary), `text-foreground-muted` (secondary),
  `text-foreground-subtle`/`-faint`; ramp `text-ink-1|2|3`; on-fill `text-primary-foreground`,
  `text-muted-foreground`; semantic `text-destructive|success|warning`; `text-accent-ink`.
- **Borders / focus**: `border-border` (default), `border-hairline` (faintest),
  `border-border-muted|-emphasis`, `border-input`; focus ring `ring-ring`.
- **Radius**: `rounded-sm|md|lg|xl|full` (bare `rounded` = 8px). **Type**: `text-xs|sm|base|lg|xl|2xl|3xl`
  (base = 15px). Spacing uses Tailwind's scale (`gap-2`, `p-3`, `space-y-4`, …).
- **Variants are PROPS, not classes.** Use a component's own `variant`/`size` props
  (`<Button variant="destructive" size="sm">`, `<Badge variant="success">`); reserve utility
  classes for layout glue *around* components, not for restyling their internals.

## Where the truth lives
- Read the design system's `styles.css` and its `@import`s for the full token + font set.
- Each component ships `<Name>.d.ts` (exact props/API) and `<Name>.prompt.md` (usage) —
  read those before composing a component. Compound components (Dialog, Select, DropdownMenu,
  Tabs, Sheet, Popover, Tooltip, Command, Accordion, Collapsible) expose sub-parts
  (`DialogContent`, `SelectItem`, …) imported from the same package.

## Build snippet
```tsx
import { Button, Input, Badge } from '@xnetjs/ui'

<div className="space-y-4 rounded-lg border border-border bg-card p-4">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-medium text-foreground">Workspace</h2>
    <Badge variant="success">Synced</Badge>
  </div>
  <Input placeholder="Search documents…" />
  <div className="flex justify-end gap-3">
    <Button variant="outline">Cancel</Button>
    <Button>Save changes</Button>
  </div>
</div>
```
