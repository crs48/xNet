import type { HTMLAttributes, ReactNode } from 'react'
import { cn, cva, type VariantProps } from '../utils'

export const badgeVariants = cva(
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

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
  removable?: boolean
  onRemove?: () => void
  children: ReactNode
}

export function Badge({
  className,
  variant,
  dot = false,
  removable = false,
  onRemove,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
      {removable && (
        <button
          type="button"
          className="ml-1 -mr-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-foreground/20"
          onClick={onRemove}
        >
          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 8 8">
            <path d="M1.41 0L0 1.41l2.59 2.59L0 6.59 1.41 8l2.59-2.59L6.59 8 8 6.59 5.41 4 8 1.41 6.59 0 4 2.59 1.41 0z" />
          </svg>
        </button>
      )}
    </span>
  )
}
