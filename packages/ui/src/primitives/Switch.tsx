import { Switch as BaseSwitch } from '@base-ui/react/switch'
import * as React from 'react'
import { cn } from '../utils'

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof BaseSwitch.Root> {
  className?: string
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(({ className, ...props }, ref) => (
  <BaseSwitch.Root
    ref={ref}
    className={cn(
      // Base styles
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center',
      'rounded-full border-2 border-transparent',
      'transition-base',
      // Unchecked state
      'bg-input',
      // Checked state
      'data-[checked]:bg-primary',
      // Focus state
      'focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-2',
      'focus-visible:ring-offset-background',
      // Disabled state
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <BaseSwitch.Thumb
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full',
        'bg-background shadow-lg ring-0',
        'transition-transform duration-fast ease-spring',
        // Position based on checked state
        'translate-x-0 data-[checked]:translate-x-4'
      )}
    />
  </BaseSwitch.Root>
))
Switch.displayName = 'Switch'

export { Switch }
