import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { Check } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root> {
  className?: string
  label?: string
  description?: string
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generatedId = React.useId()
    const checkboxId = id || `checkbox-${generatedId}`

    return (
      <div className="flex items-start gap-3">
        <BaseCheckbox.Root
          ref={ref}
          id={checkboxId}
          className={cn(
            // Base styles
            'peer h-4 w-4 shrink-0 rounded-sm',
            'border border-primary',
            'transition-base',
            // Focus state
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring focus-visible:ring-offset-2',
            'focus-visible:ring-offset-background',
            // Checked state
            'data-[checked]:bg-primary data-[checked]:text-primary-foreground',
            // Disabled state
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        >
          <BaseCheckbox.Indicator
            className={cn(
              'flex items-center justify-center text-current',
              'opacity-0 scale-75',
              'transition-all duration-fast ease-spring',
              'data-[checked]:opacity-100 data-[checked]:scale-100'
            )}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </BaseCheckbox.Indicator>
        </BaseCheckbox.Root>
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
            {description && <p className="mt-1 text-foreground-muted">{description}</p>}
          </div>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }
