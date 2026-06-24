// design-sync: ui-scoped Tailwind config used to compile a self-contained
// stylesheet for the package-shape bundle (cfg.cssEntry → .design-sync/ui.css).
// Reuses @xnetjs/ui's own tailwind theme; content globs are repo-root-relative
// (run from repo root) and include the authored previews so any utility classes
// used there are also generated.
import base from '../packages/ui/tailwind.config.js'

// Safelist the full design-token utility vocabulary so the claude.ai/design agent
// can build with the whole palette (not just the subset current components happen
// to use). These render in any synced design via styles.css → ds-ui.css.
const tokenSafelist = [
  // backgrounds
  'bg-background', 'bg-background-subtle', 'bg-background-muted', 'bg-background-emphasis',
  'bg-surface-0', 'bg-surface-1', 'bg-surface-2',
  'bg-primary', 'bg-primary-hover', 'bg-primary-muted', 'bg-secondary', 'bg-muted', 'bg-accent',
  'bg-card', 'bg-popover', 'bg-destructive', 'bg-destructive-muted', 'bg-success', 'bg-success-muted',
  'bg-warning', 'bg-warning-muted',
  // text
  'text-foreground', 'text-foreground-muted', 'text-foreground-subtle', 'text-foreground-faint',
  'text-ink-1', 'text-ink-2', 'text-ink-3', 'text-accent-ink',
  'text-primary', 'text-primary-foreground', 'text-secondary-foreground', 'text-muted-foreground',
  'text-accent-foreground', 'text-card-foreground', 'text-destructive', 'text-success', 'text-warning',
  // borders + rings
  'border-border', 'border-border-muted', 'border-border-emphasis', 'border-hairline', 'border-input',
  'ring-ring',
  // type
  'font-sans', 'font-mono'
]

export default {
  ...base,
  content: [
    'packages/ui/src/**/*.{js,ts,jsx,tsx}',
    '.design-sync/previews/**/*.{ts,tsx}'
  ],
  safelist: tokenSafelist
}
