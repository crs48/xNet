# 03 - Primitive Migration

> Convert all existing components from hardcoded colors to semantic tokens + CVA

## Overview

All 10 existing primitives in `packages/ui/src/primitives/` currently use hardcoded Tailwind palette colors (`bg-blue-600`, `bg-white`, `text-gray-900`, etc.). This document specifies the migration to semantic tokens for each component.

## Migration Strategy

For each component:

1. Replace raw palette colors with semantic tokens
2. Convert variant definitions to CVA
3. Add `dark:` awareness (happens automatically with tokens)
4. Ensure `className` pass-through via `cn()`
5. Keep API backwards-compatible where possible

## Component Migrations

### Button.tsx

**Before:**

```typescript
const variants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
}
```

**After:**

```typescript
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner className="animate-spin" />}
        {children}
      </Comp>
    )
  }
)

export { Button, buttonVariants }
```

**API changes:** `variant="primary"` becomes `variant="default"`, `variant="danger"` becomes `variant="destructive"`. Add `variant="link"`.

### Modal.tsx (Dialog)

**Before:**

```typescript
// Hardcoded: bg-white, text-gray-900, border-gray-200
```

**After:**

```typescript
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '../utils'

const DialogOverlay = forwardRef<...>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))

const DialogContent = forwardRef<...>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
```

### Select.tsx

**Key changes:**

- Trigger: `border-input bg-background text-foreground` (was `border-gray-300 bg-white text-gray-900`)
- Content: `bg-popover text-popover-foreground border` (was `bg-white border-gray-200`)
- Items: `hover:bg-accent hover:text-accent-foreground` (was `hover:bg-gray-100`)
- Selected: `bg-accent text-accent-foreground` (was `bg-blue-50 text-blue-700`)

### Checkbox.tsx

**Key changes:**

- Box: `border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground` (was `border-blue-600 bg-blue-600 text-white`)
- Unchecked: `border border-input` (was `border-gray-300`)

### Tooltip.tsx

**Key changes:**

- Content: `bg-primary text-primary-foreground` (was `bg-gray-900 text-white`)

### Popover.tsx

**Key changes:**

- Content: `bg-popover text-popover-foreground border shadow-md` (was `bg-white border-gray-200`)

### Menu.tsx (DropdownMenu)

**Key changes:**

- Content: `bg-popover text-popover-foreground border` (was `bg-white border-gray-200 text-gray-900`)
- Items: `focus:bg-accent focus:text-accent-foreground` (was `hover:bg-gray-100`)
- Separator: `bg-muted` (was `bg-gray-200`)

### Badge.tsx

**Key changes:** Convert to CVA with semantic variant colors (see 02-utilities.md).

### Input.tsx

**Key changes:**

- `border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring` (was `border-gray-300 bg-white text-gray-900 focus:ring-blue-500`)

### IconButton.tsx

**Key changes:** Compose with `buttonVariants({ variant: 'ghost', size: 'icon' })`.

## Composed Component Migrations

### DatePicker, ColorPicker, TagInput, SearchInput

These compose primitives, so they mostly inherit the token changes. Key updates:

- Replace any remaining `bg-white`, `text-gray-*`, `border-gray-*` with semantic tokens
- Ensure dropdown/popover portions use `bg-popover text-popover-foreground`

### EmptyState

- `text-muted-foreground` for description text
- `text-foreground` for titles

### Skeleton

- `bg-muted animate-pulse` (was `bg-gray-200 animate-pulse`)

## Search-and-Replace Guide

Run across all files in `packages/ui/src/`:

| Find                | Replace With                                               |
| ------------------- | ---------------------------------------------------------- |
| `bg-white`          | `bg-background` or `bg-card` (context-dependent)           |
| `bg-gray-50`        | `bg-muted` or `bg-accent`                                  |
| `bg-gray-100`       | `bg-secondary` or `bg-muted`                               |
| `bg-gray-200`       | `bg-muted`                                                 |
| `bg-gray-900`       | `bg-foreground` (rare, usually flip to text token)         |
| `text-white`        | `text-primary-foreground` or `text-destructive-foreground` |
| `text-gray-900`     | `text-foreground`                                          |
| `text-gray-700`     | `text-foreground`                                          |
| `text-gray-500`     | `text-muted-foreground`                                    |
| `text-gray-400`     | `text-muted-foreground`                                    |
| `border-gray-200`   | `border-border` or `border`                                |
| `border-gray-300`   | `border-input`                                             |
| `bg-blue-600`       | `bg-primary`                                               |
| `bg-blue-700`       | `bg-primary/90`                                            |
| `bg-blue-50`        | `bg-primary/10`                                            |
| `text-blue-600`     | `text-primary`                                             |
| `text-blue-700`     | `text-primary`                                             |
| `bg-red-600`        | `bg-destructive`                                           |
| `bg-red-700`        | `bg-destructive/90`                                        |
| `text-red-600`      | `text-destructive`                                         |
| `ring-blue-500`     | `ring-ring`                                                |
| `focus:ring-blue-*` | `focus-visible:ring-ring`                                  |

## Checklist

- [ ] Migrate Button.tsx to CVA + semantic tokens
- [ ] Migrate Modal.tsx (Dialog) to semantic tokens
- [ ] Migrate Select.tsx to semantic tokens
- [ ] Migrate Checkbox.tsx to semantic tokens
- [ ] Migrate Tooltip.tsx to semantic tokens
- [ ] Migrate Popover.tsx to semantic tokens
- [ ] Migrate Menu.tsx (DropdownMenu) to semantic tokens
- [ ] Migrate Badge.tsx to CVA + semantic tokens
- [ ] Migrate Input.tsx to semantic tokens
- [ ] Migrate IconButton.tsx to compose buttonVariants
- [ ] Migrate DatePicker, ColorPicker, TagInput, SearchInput
- [ ] Migrate EmptyState and Skeleton
- [ ] Verify: no raw palette colors remain in packages/ui/src/
- [ ] Verify: all components render in light mode
- [ ] Verify: all components render in dark mode (`.dark` on html)
- [ ] Update component stories/examples if they exist

---

[Previous: Utilities](./02-utilities.md) | [Next: New Primitives](./04-new-primitives.md)
