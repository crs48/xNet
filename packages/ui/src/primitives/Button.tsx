import {
  forwardRef,
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactNode,
  type ReactElement
} from 'react'
import { cn, cva, type VariantProps } from '../utils'

// ─── Slot Component (replaces @radix-ui/react-slot) ─────────────────────────

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: ReactNode
}

/**
 * Slot component that merges its props onto its immediate child.
 * Used for the `asChild` pattern to render a different element.
 */
const Slot = forwardRef<HTMLElement, SlotProps>(({ children, ...props }, ref) => {
  if (!isValidElement(children)) {
    return null
  }

  return cloneElement(children as ReactElement, {
    ...props,
    ...children.props,
    ref,
    className: cn(props.className, children.props.className)
  })
})
Slot.displayName = 'Slot'

export const buttonVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap rounded-md text-sm font-medium',
    'transition-base',
    // Focus state
    'focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-ring focus-visible:ring-offset-2',
    'focus-visible:ring-offset-background',
    // Disabled state
    'disabled:pointer-events-none disabled:opacity-50',
    // Icon sizing
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-primary text-primary-foreground shadow-sm',
          'hover:bg-primary-hover',
          'active:bg-primary-active'
        ],
        destructive: [
          'bg-destructive text-destructive-foreground shadow-sm',
          'hover:bg-destructive-hover',
          'active:bg-destructive-active'
        ],
        outline: [
          'border border-border bg-background',
          'hover:bg-background-muted hover:text-foreground',
          'active:bg-background-emphasis'
        ],
        secondary: [
          'bg-secondary text-secondary-foreground',
          'hover:bg-secondary/80',
          'active:bg-secondary/70'
        ],
        ghost: [
          'text-foreground-muted',
          'hover:bg-background-muted hover:text-foreground',
          'active:bg-background-emphasis'
        ],
        link: ['text-primary underline-offset-4', 'hover:underline', 'active:text-primary-active']
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && leftIcon}
        {children}
        {!loading && rightIcon}
      </Comp>
    )
  }
)

Button.displayName = 'Button'
