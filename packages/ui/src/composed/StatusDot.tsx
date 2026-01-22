import { cn, cva, type VariantProps } from '../utils'

export const statusDotVariants = cva('inline-block rounded-full shrink-0', {
  variants: {
    status: {
      connected: 'bg-success',
      connecting: 'bg-warning animate-pulse',
      disconnected: 'bg-muted-foreground',
      error: 'bg-destructive',
      synced: 'bg-success',
      syncing: 'bg-primary animate-pulse'
    },
    size: {
      sm: 'h-1.5 w-1.5',
      md: 'h-2 w-2',
      lg: 'h-2.5 w-2.5'
    }
  },
  defaultVariants: {
    size: 'md'
  }
})

export interface StatusDotProps extends VariantProps<typeof statusDotVariants> {
  className?: string
  label?: string
}

export function StatusDot({ status, size, className, label }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn(statusDotVariants({ status, size }), className)} />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  )
}
