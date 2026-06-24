# design-sync notes — xNet

Design system synced: **`@xnetjs/ui`** (shadcn-style kit: HSL design tokens, CVA
variants, Tailwind, light/dark via `ThemeProvider`). Shape: **package**.

## Why package shape, not storybook shape
- The repo Storybook is **catalog-organized**: only `Button` + `SettingsView` have
  true per-component stories; the rest are `*Catalog` "Overview" showcase pages.
  Storybook-shape pairing (title→export) therefore yields only **2** component cards
  (`[TITLE_UNMAPPED]: Catalog, DevtoolsCatalog`).
- Package shape derives the roster from `@xnetjs/ui`'s `.d.ts` exports → the full
  ~40+ component inventory, each importable with a `.d.ts` + `.prompt.md`. User chose
  package shape + author previews for **everything**.
- The ui-scoped Storybook (`.design-sync/sb-config/` → `.design-sync/sb-reference/`)
  is kept as a **visual composition reference** only (not used by the package-shape
  converter). Its compiled CSS also seeded the cssEntry approach below.

## CSS — Tailwind JIT compiled (package shape has no shipped stylesheet)
- `@xnetjs/ui` is styled by Tailwind utilities (JIT). `dist/` ships NO compiled CSS;
  `tokens.css` alone defines `:root` vars but not the `.bg-background`/etc utilities.
- Fix: compile a self-contained stylesheet via Tailwind CLI and point `cfg.cssEntry`
  at it. **cssEntry is bounded to the package dir** (`packages/ui`), so it lives at
  `packages/ui/dist/ds-ui.css` (dist is gitignored, regenerated).
- Compile: `node_modules/.bin/tailwindcss -c .design-sync/tailwind.config.js -i .storybook/storybook.css -o packages/ui/dist/ds-ui.css --minify`
  (`.design-sync/tailwind.config.js` reuses ui's theme; content scans `packages/ui/src`
  **and** `.design-sync/previews` so authored-preview classes compile too).
- **`cfg.buildCmd` chains both** (dist build, which cleans dist, THEN the CSS compile):
  re-syncs that re-run buildCmd refresh dist + CSS together.
- Tailwind v3.4.19 CLI DOES resolve the `@import`s in `storybook.css` (theme files
  inline into the output — verified 0 raw `@import` remain).

## Scope decision (first sync)
- Synced **`@xnetjs/ui` core kit only** (user choice). It's a self-contained leaf
  package (no `@xnetjs/*` workspace deps — the `abuse`/`data` mentions in src are
  comments only; `dist/index.js` has zero `@xnetjs/*` externals).
- **Deferred** surfaces (`editor`, `views`, `canvas`, `dashboard`): each depends on
  `@xnetjs/ui` plus a heavy runtime web (`core`/`data`/`react`/`vectors`/…).
  `canvas → vectors → usearch` drags in `node:fs` → breaks browser bundling.
  Add incrementally on a later re-sync via `extraEntries` + `storyImports.bundle`,
  one surface at a time, watching for the node:fs wall.
- **App components** (`apps/web`, `apps/electron` stories: ReactionBar, Coachmark,
  SystemMenu, PresenceDot, PresenceAvatars, StorageWarningBanner) have no
  publishable `dist/` — outside the converter's envelope.

## Build gotchas
- **Worktree starts with NO `node_modules`** → `COREPACK_ENABLE_STRICT=0 pnpm install --frozen-lockfile` first.
- DS dist: `pnpm -F @xnetjs/ui build` (tsup, ~300ms → `packages/ui/dist/index.js` + `.d.ts`).
- Converter `--entry ./packages/ui/dist/index.js` is **required**: `node_modules/@xnetjs/ui`
  resolves to TS source (`package.json` main = `./src/index.ts`), not the built dist.
- `--node-modules packages/ui/node_modules` (has `react`/`react-dom` via pnpm symlinks).
- Toolchain: pnpm 10.30.3, node 23 (`.nvmrc`), Storybook **10.2.16** (`@storybook/react-vite`, vite 7).

## Storybook reference — ui-scoped config (`.design-sync/sb-config/`)
- The repo `.storybook/main.ts` aggregates **7 packages/apps**. The non-UI stories
  import `@xnetjs/runtime` (unbuilt + NOT in `.storybook/workspace-aliases.ts`) →
  `[commonjs--resolver] Failed to resolve entry for package "@xnetjs/runtime"` →
  **the whole Storybook preview build fails (no `iframe.html`)**.
- Fix: committed ui-scoped config at `.design-sync/sb-config/` (`main.ts` reuses the
  repo config but narrows `stories` to `../../packages/ui/src/**`, rebases the local
  perf-panel addon path; `preview.tsx` re-exports the repo preview verbatim). Build:
  `npx storybook build -c .design-sync/sb-config -o .design-sync/sb-reference`.
- **Never `| tail` the storybook build** — it masks the exit code (a failed build
  still printed only Vite "use client" warnings + "exited with an error"). Redirect
  to a file and check `STORYBOOK_EXIT`.

## Fonts (`[FONT_MISSING]` fix)
- DS tailwind names `"Inter Variable"`, `Inter`, `"Geist Mono"`; `@xnetjs/ui` ships
  no `@font-face` for them. Shipped from durable `.design-sync/fonts/` via
  `cfg.extraFonts: ["../../.design-sync/fonts/fonts.css"]` (bounded to workspace root).
- woff2 copied from `@fontsource-variable/inter@5.2.8` (latin + latin-ext, variable
  100–900) and `@fontsource/geist-mono@5.2.8` (latin 400/500/600/700) — both OFL,
  only in `.pnpm/` (transitive deps, not symlinked at root `node_modules/@fontsource`).
- `fonts.css` declares `@font-face` for **both** `"Inter Variable"` AND `"Inter"`
  (the plain-name fallback in the stack) → otherwise `[FONT_MISSING]` flags `"Inter"`.

## Roster curation
- Package shape discovered **191** exports; ~121 are compound sub-parts
  (`DialogContent`, `SelectItem`, `TooltipArrow`, `DropdownMenu*`, `Sheet*`,
  `Sidebar*`, `Settings*`-kit, …) → excluded via `cfg.componentSrcMap: {…: null}`.
  They stay importable in `_ds_bundle.js`; compose them inside their parent's preview.
- Kept **70 top-level** components. Render baseline: build + validate exit 0,
  `FONT_MISSING` clear; floor-card thin/blank on a handful (Input, StatusDot,
  ResponsiveTable, DIDAvatar, KeyValue, AccessibleIconButton/Textarea,
  MentionTextInput, TaskStatusIcon) — all resolved by authoring previews.

## Story organization
- Stories are **catalog-organized**, not per-component: `UI/Primitives/Catalog`,
  `UI/Components/Catalog`, `UI/Comments/Catalog`, `UI/Composed/Devtools Catalog` each
  have one `Overview` showcase export. Only `UI/Primitives/Button` (Button) and
  `UI/Composed/SettingsView` (SettingsView) are true per-component stories.
  (titleMap/overrides handling recorded once the converter's pairing is seen.)

## Authoring previews (package shape)
- Author `.design-sync/previews/<Name>.tsx`; each named export = one card cell.
  Import real components from `'@xnetjs/ui'` (compiler redirects to `window.XNetUI`).
  lucide-react icons import fine (ui dep). Use the DS's own Tailwind classes for
  layout glue (`flex gap-3`, `text-foreground-muted`, `bg-background-subtle`, …).
- **Compound sub-parts (DialogContent, SelectItem, …) are excluded from the roster
  but STILL importable from `'@xnetjs/ui'`** — compose them inside the parent's preview.
- **Overlay components** (Dialog✓, Sheet, Popover compound, DropdownMenu/Menu, Tooltip,
  CommandPalette, ResponsiveDialog): render OPEN (`defaultOpen`, `modal={false}`) and
  set `cfg.overrides.<Name>: {"cardMode":"single","viewport":"WxH"}` so the portal is
  contained. Dialog uses `640x460`. (Verified with Dialog.)
- Solo set graded **good**: Button (Variants/Sizes/WithIcons/States), Dialog (Default),
  MarkdownContent (Default/Compact). Tokens, both fonts (Inter sans, Geist mono in
  `code`), and overlay containment all confirmed working.
- Targeted loop (subagents): `node .ds-sync/lib/preview-rebuild.mjs --config .design-sync/config.json --node-modules packages/ui/node_modules --out ./ds-bundle --components <Name>`
  then `node .ds-sync/package-capture.mjs --out ./ds-bundle --components <Name>`.

## Folded wave learnings (authoring gotchas — reuse these)
- **[GENERAL] Provider-hook components blank in capture.** Any component calling
  `useTheme()` (or any `useX()` that throws on a missing provider) renders an EMPTY
  card — the package-capture harness does NOT apply `.storybook/preview` decorators.
  Fix in the preview: wrap it, e.g. `<ThemeProvider defaultTheme="light">…</ThemeProvider>`
  (both exported from `@xnetjs/ui`). (Chose inline-wrap over a global `cfg.provider` to
  avoid clearing all earned grades; in package shape the authored preview IS the only
  preview, so no shadowing.)
- **[GENERAL] DropdownMenu/Menu: `DropdownMenuLabel` must be inside `<DropdownMenuGroup>`.**
  Bare under `DropdownMenuContent`, or inside a `DropdownMenuRadioGroup`, throws
  `Base UI: MenuGroupRootContext is missing` and blanks the whole card. (PrimitiveCatalog
  uses it bare — that pattern errors at runtime; don't copy it. Render radio-group
  sub-headings as a plain styled `<div>`.)
- **Overlays — force open via the COMPOUND API.** Simple wrappers lack a static-open prop:
  `<Tooltip content>` → use `<TooltipProvider><TooltipRoot defaultOpen>…`; `<Popover trigger>`
  → use `<PopoverRoot defaultOpen>…`. `Dialog`/`Modal`/`Sheet` accept `defaultOpen modal={false}`.
  `Collapsible` accepts `defaultOpen`. All overlays need `cfg.overrides.<Name>.cardMode:"single"`
  + a viewport (orchestrator-set; already done for Dialog/Modal/Sheet/Popover/DropdownMenu/Menu/
  Tooltip/ResponsiveDialog/CommandPalette).
- **CommandPalette**: render open via `open` (controlled bool); `PaletteCommand.execute` required;
  icon names are kebab strings resolved to Lucide internally.
- **DataTable**: prop is `data` (not `rows`); `Column.render(value,row)` can embed components.
- **IconButton** default variant is `ghost` (transparent) — use `variant="default"` for visible chrome.
- **Native-attr passthrough**: `InputProps` extends `InputHTMLAttributes` (so `disabled`/
  `placeholder`/`defaultValue` work even though not in the generated `.d.ts`).
- **Static captures don't interact**: Select simple-API shows only the closed trigger (grade it);
  ScrollArea needs an explicit height (`h-64`) to show its clip/scrollbar. Use fixed booleans
  (no React state) for control states.
- **[GENERAL] Authored previews CANNOT introduce NEW Tailwind classes.** `preview-rebuild.mjs`
  re-bundles JS only and reuses the existing `_ds_bundle.css`; it does NOT re-run the Tailwind
  compile. A utility used ONLY in `.design-sync/previews/**` (not already emitted by `packages/ui/src`)
  is a no-op. Use only classes the package ships. **Consequence for the final build: re-run the
  Tailwind compile (`cfg.buildCmd`'s CSS step — its content scans `previews/`) to regenerate
  `packages/ui/dist/ds-ui.css` BEFORE the final `package-build`**, so any preview-only classes ship.
  (To override a base-layer rule use plain utilities — `@layer utilities` wins by order; `!important`
  arbitrary variants like `[&_.x]:!top-0` are NOT compiled.)
- **Self-contained `useState` popovers (DatePicker, ColorPicker, MentionTextArea typeahead)**
  open only on click and expose NO `defaultOpen`/controlled-open — their open panel can't render
  statically and `cardMode` can't force it. Grade the closed trigger / value state (the meaningful default).
- **`position:fixed` overlays anchored at `{x,y}`** (CommentPopover, ThreadPicker) escape the
  product grid card → set `cardMode:"single"` (done). ResponsiveSidebar shows the full desktop nav
  only ≥1024px → override viewport `1100x460` (done) else it renders the collapsed tablet icon-rail.
- **package-capture "N error(s)"** can be a benign console warning, not a render failure — grade the
  image, not the error count (seen on SensitiveContent, OrphanedThreadList; both render fully).
- **[GENERAL] Full-page composed views collapse to ~0 height** in the grid card (`flex h-full` —
  SettingsView, ResponsiveSidebar, CommentsSidebar) → wrap the preview in a fixed-height frame
  `<div className="h-[520px] overflow-hidden rounded-lg border border-border bg-background">`.
- **ThemeProvider light+dark in one card**: it toggles the `dark` class on `document.documentElement`
  (global), so the last cell would win for all → scope the dark cell with a local `<div className="dark …">`
  (`tokens.css` dark tokens are `.dark`-scoped). Dark-ramp `primary` is "paper" (light) → the primary
  Button is white in dark mode (faithful to the monochrome ramp, not a bug).
- Task due-date urgency is computed against the wall clock → fixtures must straddle "today" for the
  overdue/today/upcoming colors to vary. `TaskPriorityIcon` renders `null` for medium/unset (by design).

## Composition sources (where each component's idiomatic usage lives)
- **PrimitiveCatalog** `packages/ui/src/primitives/PrimitiveCatalog.stories.tsx`:
  Accordion, Badge, Checkbox, Collapsible, Command, IconButton, Input, Menu(DropdownMenu),
  Modal(Dialog), Popover, ResizablePanel, ScrollArea, Select, Separator, Sheet, Switch,
  Tabs, Tooltip.
- **ComponentCatalog** `packages/ui/src/components/ComponentCatalog.stories.tsx`:
  Accessible{Button,IconButton,Input,Textarea}, BottomNav, ColorPicker, DIDAvatar,
  DatePicker, EmptyState, ResponsiveTable, SearchInput, Skeleton{,Avatar,Button,Card,Text},
  SkipLink(s), TagInput.
- **DevtoolsCatalog** `packages/ui/src/composed/DevtoolsCatalog.stories.tsx`:
  CodeBlock, CommandPalette, DataTable, KeyValue, LogEntry, StatusDot, ThemeToggle, TreeView.
- **CommentsCatalog** `packages/ui/src/composed/comments/CommentsCatalog.stories.tsx`:
  CommentBubble, CommentPopover, CommentsSidebar, OrphanedThreadList, ThreadPicker.
- **SettingsView story** `packages/ui/src/composed/SettingsView.stories.tsx`: SettingsView.
- No catalog (compose from component source `.tsx` + generated `.d.ts`, and any test
  file in the same dir): CodeEditor, LinkifiedText, MentionTextArea, ResponsiveDialog,
  ResponsiveSidebar, SensitiveContent, Presence, ThemeProvider, and all tasks/*
  (TaskCard, TaskChip, TaskRow, TaskDetailForm, TaskStatusIcon, MentionTextInput).

## Known render warns (triaged legitimate — not new on re-sync)
- `[RENDER_THIN]` **Dialog, Modal, Sheet, ResponsiveDialog** — these are `cardMode:single`
  overlays whose content is `position:fixed`, so the card root measures `maxHeight 0/1`.
  The screenshots render the full overlay (verified). Heuristic false-positive.
- `[RENDER_BLANK]`/`bad` **OrphanedThreadList, SensitiveContent** — `rootEmpty:false`, large
  PNGs (54KB/97KB); their `firstErr` is rendered TEXT, not a JS error (a benign console
  message during render). Screenshots render fully (verified). Heuristic false-positive.
- Any `[RENDER_THIN]` on genuinely small components (StatusDot, TaskStatusIcon, icon-only
  buttons) is expected — they're small by design.

## Re-sync risks
- **Authored previews are pinned to the @xnetjs/ui API as of 0.0.1.** If component
  props change upstream, the relevant `.design-sync/previews/<Name>.tsx` may need updating
  (capture re-grades them when their source changes). The `ref?` prop in several `.d.ts`
  shows a React-internal `DO_NOT_USE_…` type — cosmetic, harmless, not fixed per-component.
- **CSS + fonts are build-time snapshots.** `packages/ui/dist/ds-ui.css` and the woff2 in
  `.design-sync/fonts/` are regenerated by `cfg.buildCmd`; a Tailwind/token change upstream
  needs a buildCmd re-run before the converter (else stale utilities/tokens ship).
- **Sub-part exclusion list (`componentSrcMap`) is hand-curated.** New top-level components
  added to `@xnetjs/ui` will appear as floor cards (good); new compound sub-parts will appear
  as spurious cards until added to the null list.
- The ui-scoped Storybook (`.design-sync/sb-config/`, `sb-reference/`) is NOT used by the
  package-shape converter — kept as a visual reference only.
