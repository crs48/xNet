import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { forwardRef } from 'react'
import { cn } from '../utils'

export interface CheckboxProps extends React.ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
> {
  label?: string
  description?: string
}

export const Checkbox = forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).slice(2)}`

    return (
      <div className="flex items-start gap-3">
        <CheckboxPrimitive.Root
          ref={ref}
          id={checkboxId}
          className={cn(
            'peer h-4 w-4 shrink-0 rounded-sm border border-input bg-transparent shadow',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
            className
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator className="flex items-center justify-center">
            <svg
              className="h-3 w-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 6L5 8.5L9.5 3.5" />
            </svg>
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        {(label || description) && (
          <div className="text-sm leading-none">
            {label && (
              <label
                htmlFor={checkboxId}
                className="font-medium text-foreground cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {label}
              </label>
            )}
            {description && <p className="mt-1 text-muted-foreground">{description}</p>}
          </div>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'
