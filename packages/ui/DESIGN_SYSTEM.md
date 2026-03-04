# xNet Design System

A clean, minimal, timeless design system for xNet applications.

## Philosophy

- **Invisible Design**: The best UI is one you don't notice
- **Meaningful Motion**: Every animation serves a purpose
- **Restrained Palette**: Monochrome + one accent color
- **Generous Whitespace**: Breathing room is not wasted space
- **Instant Feedback**: Every interaction responds in <100ms

## Quick Start

```tsx
// Import styles
import '@xnetjs/ui/tokens.css'
import '@xnetjs/ui/motion.css'
import '@xnetjs/ui/accessibility.css'

// Import components
import { Button, Input, Modal } from '@xnetjs/ui'
```

## Color Tokens

### Backgrounds

| Token                   | Light   | Dark    | Use             |
| ----------------------- | ------- | ------- | --------------- |
| `--background`          | #ffffff | #121212 | Page background |
| `--background-subtle`   | #fafafa | #1a1a1a | Cards           |
| `--background-muted`    | #f5f5f5 | #212121 | Hover states    |
| `--background-emphasis` | #f0f0f0 | #292929 | Active states   |

### Foregrounds

| Token                 | Light   | Dark    | Use            |
| --------------------- | ------- | ------- | -------------- |
| `--foreground`        | #171717 | #f2f2f2 | Primary text   |
| `--foreground-muted`  | #737373 | #a6a6a6 | Secondary text |
| `--foreground-subtle` | #a3a3a3 | #808080 | Tertiary text  |
| `--foreground-faint`  | #c7c7c7 | #595959 | Placeholder    |

### Primary

| Token              | Light   | Dark    | Use                  |
| ------------------ | ------- | ------- | -------------------- |
| `--primary`        | #2563eb | #3b82f6 | Interactive elements |
| `--primary-hover`  | #1d4ed8 | #60a5fa | Hover state          |
| `--primary-active` | #1e40af | #2563eb | Active state         |
| `--primary-muted`  | #eff6ff | #1e3a5f | Subtle backgrounds   |

### Semantic Colors

| Token           | Use                              |
| --------------- | -------------------------------- |
| `--destructive` | Delete, errors, destructive acts |
| `--success`     | Completed actions, saved states  |
| `--warning`     | Caution, pending actions         |

## Typography

| Class       | Size | Weight | Use              |
| ----------- | ---- | ------ | ---------------- |
| `text-xs`   | 11px | 400    | Captions, badges |
| `text-sm`   | 13px | 400    | Secondary text   |
| `text-base` | 15px | 400    | Body text        |
| `text-lg`   | 17px | 500    | Subheadings      |
| `text-xl`   | 20px | 600    | Section headings |
| `text-2xl`  | 24px | 600    | Page titles      |
| `text-3xl`  | 30px | 700    | Hero text        |

## Spacing

| Value | Pixels | Use               |
| ----- | ------ | ----------------- |
| `1`   | 4px    | Related items     |
| `2`   | 8px    | Grouped items     |
| `3`   | 12px   | Component padding |
| `4`   | 16px   | Section gaps      |
| `6`   | 24px   | Major sections    |
| `8`   | 32px   | Page sections     |

## Animation

### Durations

| Token               | Value | Use                |
| ------------------- | ----- | ------------------ |
| `--duration-fast`   | 100ms | Micro-interactions |
| `--duration-normal` | 150ms | State changes      |
| `--duration-slow`   | 200ms | Entrances          |
| `--duration-slower` | 300ms | Page transitions   |

### Easings

| Token           | Value                             | Use       |
| --------------- | --------------------------------- | --------- |
| `--ease-out`    | cubic-bezier(0, 0, 0.2, 1)        | Entrances |
| `--ease-in`     | cubic-bezier(0.4, 0, 1, 1)        | Exits     |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Bouncy    |

### Animation Classes

```tsx
// Fade
<div className="animate-fade-in" />
<div className="animate-fade-out" />

// Scale
<div className="animate-scale-in" />
<div className="animate-scale-out" />

// Slide
<div className="animate-slide-in-bottom" />
<div className="animate-slide-in-right" />
```

## Components

### Button

```tsx
import { Button } from '@xnetjs/ui'

// Variants
<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

### Input

```tsx
import { Input } from '@xnetjs/ui'

<Input placeholder="Enter text..." />
<Input type="email" />
<Input disabled />
```

### Modal

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@xnetjs/ui'
;<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Tabs

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@xnetjs/ui'
;<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

## Accessibility

### Focus Management

All interactive elements have visible focus indicators:

```css
:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
```

### Skip Link

Add to the top of your app:

```tsx
import { SkipLink } from '@xnetjs/ui'
;<SkipLink href="#main-content" />
```

### Screen Readers

Use `sr-only` for screen-reader-only content:

```tsx
<button>
  <Icon aria-hidden="true" />
  <span className="sr-only">Close menu</span>
</button>
```

### Reduced Motion

Animations are automatically disabled when the user prefers reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Responsive Design

### Breakpoints

| Breakpoint | Width  | Target       |
| ---------- | ------ | ------------ |
| `sm`       | 640px  | Large phones |
| `md`       | 768px  | Tablets      |
| `lg`       | 1024px | Laptops      |
| `xl`       | 1280px | Desktops     |

### Touch Targets

Minimum touch target size is 44x44px:

```tsx
<Button className="h-11 w-11">
  <Icon />
</Button>
```

## Migration Notes

If you're migrating from the previous primitive API:

| Previous API     | Base UI (xNet)                           |
| ---------------- | ---------------------------------------- |
| `Dialog.Content` | `DialogContent` (uses `Dialog.Popup`)    |
| `Dialog.Overlay` | `DialogOverlay` (uses `Dialog.Backdrop`) |
| `asChild`        | `render` prop                            |
| `DropdownMenu`   | `Menu`                                   |

### Data Attributes

Base UI uses different data attributes for animation states:

| Previous API          | Base UI             |
| --------------------- | ------------------- |
| `data-state="open"`   | `data-open`         |
| `data-state="closed"` | (no attribute)      |
| N/A                   | `data-ending-style` |

Use in CSS:

```css
.dialog-popup[data-open] {
  opacity: 1;
  transform: scale(1);
}

.dialog-popup[data-ending-style] {
  opacity: 0;
  transform: scale(0.95);
}
```

## Dependencies

The design system is built on:

- **@base-ui/react** - Headless component primitives (actively maintained by MUI)
- **tailwindcss** - Utility-first CSS framework
- **tailwindcss-animate** - Animation utilities
- **class-variance-authority** - Variant styling
- **cmdk** - Command palette (kept for fuzzy search capabilities)

## File Structure

```
packages/ui/
├── src/
│   ├── theme/
│   │   ├── tokens.css          # Color, spacing, radius tokens
│   │   ├── motion.css          # Animation keyframes and utilities
│   │   ├── base-ui-animations.css # Base UI component animations
│   │   ├── accessibility.css   # Focus, skip link, high contrast
│   │   └── responsive.css      # Safe areas, touch targets
│   ├── primitives/             # Base UI wrapped components
│   ├── composed/               # Higher-level composed components
│   ├── hooks/                  # React hooks (useMediaQuery, etc.)
│   └── utils/                  # Utilities (cn, cva, etc.)
├── tailwind.config.js          # Extended Tailwind theme
├── DESIGN_SYSTEM.md            # This file
└── COMPONENT_AUDIT.md          # Component checklist
```
