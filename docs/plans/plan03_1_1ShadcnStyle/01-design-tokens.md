# 01 - Design Tokens

> Define the HSL color system, CSS variables, and unified Tailwind configuration

## Overview

This document defines the single source of truth for all colors, spacing, and visual tokens in xNet. We adopt shadcn's HSL-based CSS variable pattern which enables:

- Tailwind opacity modifiers (`bg-primary/80`)
- Easy dark mode switching (swap variable values)
- Consistent theming across all apps

## Token CSS File

This file lives in `packages/ui/src/theme/tokens.css` and is imported by all apps.

```css
/* packages/ui/src/theme/tokens.css */

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* ─── Layout ────────────────────────────────── */
    --radius: 0.5rem;

    /* ─── Core Backgrounds ──────────────────────── */
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;

    /* ─── Card / Panel ──────────────────────────── */
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;

    /* ─── Popover / Dropdown ────────────────────── */
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;

    /* ─── Primary (brand action) ────────────────── */
    --primary: 221 83% 53%;
    --primary-foreground: 210 40% 98%;

    /* ─── Secondary ─────────────────────────────── */
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;

    /* ─── Muted (subtle backgrounds/text) ───────── */
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;

    /* ─── Accent (hover/active states) ──────────── */
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;

    /* ─── Destructive (danger/error) ────────────── */
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;

    /* ─── Success ───────────────────────────────── */
    --success: 142 76% 36%;
    --success-foreground: 0 0% 98%;

    /* ─── Warning ───────────────────────────────── */
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 9%;

    /* ─── Borders & Inputs ──────────────────────── */
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 221 83% 53%;

    /* ─── Sidebar (optional, for apps with sidebars) */
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-border: 220 13% 91%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;

    /* ─── Chart colors (for data visualization) ─── */
    --chart-1: 221 83% 53%;
    --chart-2: 142 76% 36%;
    --chart-3: 38 92% 50%;
    --chart-4: 280 65% 60%;
    --chart-5: 0 84% 60%;
  }

  .dark {
    /* ─── Core Backgrounds ──────────────────────── */
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;

    /* ─── Card / Panel ──────────────────────────── */
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;

    /* ─── Popover / Dropdown ────────────────────── */
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;

    /* ─── Primary ───────────────────────────────── */
    --primary: 217 91% 60%;
    --primary-foreground: 222 47% 11%;

    /* ─── Secondary ─────────────────────────────── */
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;

    /* ─── Muted ─────────────────────────────────── */
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;

    /* ─── Accent ────────────────────────────────── */
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;

    /* ─── Destructive ───────────────────────────── */
    --destructive: 0 62.8% 50.6%;
    --destructive-foreground: 0 0% 98%;

    /* ─── Success ───────────────────────────────── */
    --success: 142 71% 45%;
    --success-foreground: 0 0% 98%;

    /* ─── Warning ───────────────────────────────── */
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 9%;

    /* ─── Borders & Inputs ──────────────────────── */
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 217 91% 60%;

    /* ─── Sidebar ───────────────────────────────── */
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;

    /* ─── Chart colors ──────────────────────────── */
    --chart-1: 217 91% 60%;
    --chart-2: 142 71% 45%;
    --chart-3: 38 92% 50%;
    --chart-4: 280 65% 60%;
    --chart-5: 0 63% 51%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## Unified Tailwind Configuration

All apps and packages share this base config:

```javascript
// packages/ui/tailwind.config.js (shared base)

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}'
    // Apps extend this with their own content paths
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          border: 'hsl(var(--sidebar-border))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))'
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
```

## App Tailwind Configs (Extend Shared)

Each app extends the shared config:

```javascript
// apps/electron/tailwind.config.js
const base = require('../../packages/ui/tailwind.config.js')

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...base,
  content: [
    './src/renderer/**/*.{html,tsx,ts}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/views/src/**/*.{ts,tsx}',
    '../../packages/editor/src/**/*.{ts,tsx}',
    '../../packages/devtools/src/**/*.{ts,tsx}'
  ]
}
```

## Migration from Old Variables

| Old Variable             | New Token              | Notes                   |
| ------------------------ | ---------------------- | ----------------------- |
| `--color-bg`             | `--background`         | HSL format now          |
| `--color-bg-secondary`   | `--card` or `--muted`  | Context-dependent       |
| `--color-bg-tertiary`    | `--accent`             | For hover states        |
| `--color-text`           | `--foreground`         |                         |
| `--color-text-secondary` | `--muted-foreground`   |                         |
| `--color-border`         | `--border`             |                         |
| `--color-primary`        | `--primary`            | HSL format              |
| `--color-primary-hover`  | `--primary` with `/90` | Use opacity modifier    |
| `--color-success`        | `--success`            | HSL format              |
| `--color-warning`        | `--warning`            | HSL format              |
| `--color-danger`         | `--destructive`        | Renamed to match shadcn |

## New Dependency

```bash
pnpm --filter @xnetjs/ui add -D tailwindcss-animate
```

This Tailwind plugin provides animation utilities used by Radix components (`animate-in`, `animate-out`, `fade-in`, `slide-in-from-*`, etc.).

## Checklist

- [ ] Create `packages/ui/src/theme/tokens.css` with full token set
- [ ] Update `packages/ui/tailwind.config.js` to shared base config
- [ ] Update `apps/electron/tailwind.config.js` to extend shared
- [ ] Update `apps/web/tailwind.config.js` to extend shared
- [ ] Set all Tailwind configs to `darkMode: 'class'`
- [ ] Install `tailwindcss-animate` plugin
- [ ] Remove old `globals.css` variable definitions from apps
- [ ] Import `tokens.css` in each app's entry point
- [ ] Verify light mode renders correctly
- [ ] Verify `.dark` class switches to dark theme
- [ ] Verify Tailwind opacity modifiers work (`bg-primary/50`)

---

[Next: Utilities](./02-utilities.md)
