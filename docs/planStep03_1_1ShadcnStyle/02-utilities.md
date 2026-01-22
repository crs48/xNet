# 02 - Utilities & Variant System

> Consolidate cn(), add class-variance-authority, define shared variant patterns

## Overview

Currently `cn()` is duplicated in `@xnet/ui` and `@xnet/editor`. This document consolidates utilities and introduces `class-variance-authority` (CVA) for type-safe, composable component variants.

## Install CVA

```bash
pnpm --filter @xnet/ui add class-variance-authority
```

## Updated Utilities File

```typescript
// packages/ui/src/utils.ts

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes with proper conflict resolution.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// Re-export CVA for consumers
export { cva, type VariantProps } from 'class-variance-authority'
```

## Remove Duplicate from Editor

```typescript
// packages/editor/src/utils.ts
// BEFORE:
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// AFTER:
export { cn } from '@xnet/ui'
```

## CVA Pattern Example (Button)

Before (inline object):

```typescript
const variants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100'
}
```

After (CVA):

```typescript
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  // Base classes (always applied)
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

// Type-safe variant props
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }
```

## Standard CVA Patterns for All Primitives

### Badge Variants

```typescript
const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow',
        success: 'border-transparent bg-success text-success-foreground shadow',
        warning: 'border-transparent bg-warning text-warning-foreground shadow',
        outline: 'text-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)
```

### Input Variant (size only)

```typescript
const inputVariants = cva(
  'flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-9',
        sm: 'h-8 text-xs',
        lg: 'h-10'
      }
    },
    defaultVariants: {
      size: 'default'
    }
  }
)
```

## Exports from @xnet/ui

```typescript
// packages/ui/src/index.ts

// Utilities
export { cn, cva, type VariantProps } from './utils'

// All component variant definitions are exported for extension
export { buttonVariants } from './primitives/Button'
export { badgeVariants } from './primitives/Badge'
export { inputVariants } from './primitives/Input'

// Components
export { Button } from './primitives/Button'
export { Badge } from './primitives/Badge'
// ... etc
```

This allows consumers to use variants directly:

```typescript
import { buttonVariants } from '@xnet/ui'

// Use as a link styled like a button
<Link className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
  Settings
</Link>
```

## Checklist

- [ ] Install `class-variance-authority` in `@xnet/ui`
- [ ] Update `packages/ui/src/utils.ts` to re-export `cva` and `VariantProps`
- [ ] Remove duplicate `cn()` from `packages/editor/src/utils.ts`
- [ ] Update editor to import `cn` from `@xnet/ui`
- [ ] Define `buttonVariants` using CVA
- [ ] Define `badgeVariants` using CVA
- [ ] Define `inputVariants` using CVA
- [ ] Export variant definitions from package index
- [ ] Verify TypeScript types work for VariantProps
- [ ] Verify tree-shaking still works (unused variants removed)

---

[Previous: Design Tokens](./01-design-tokens.md) | [Next: Primitive Migration](./03-primitive-migration.md)
