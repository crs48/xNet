import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils'
import { buttonVariants } from './Button'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'destructive'
  size?: 'sm' | 'default' | 'lg'
  icon: ReactNode
  label: string // For accessibility
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'default', icon, label, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          buttonVariants({ variant: variant === 'default' ? 'secondary' : variant, size: 'icon' }),
          size === 'sm' && 'h-7 w-7',
          size === 'lg' && 'h-10 w-10',
          className
        )}
        aria-label={label}
        title={label}
        {...props}
      >
        {icon}
      </button>
    )
  }
)

IconButton.displayName = 'IconButton'
