/**
 * Select component built on Base UI
 *
 * A form control for choosing a predefined value from a dropdown menu.
 */

import { Select as BaseSelect } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn } from '../utils'

// ─── Simple Select (Backward Compatible) ────────────────────────────

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  className?: string
}

/**
 * Simple select component with a convenient API.
 *
 * @example
 * <Select
 *   options={[
 *     { value: 'apple', label: 'Apple' },
 *     { value: 'banana', label: 'Banana' },
 *   ]}
 *   value={value}
 *   onValueChange={setValue}
 *   placeholder="Select a fruit"
 * />
 */
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    { options, value, onValueChange, placeholder = 'Select...', disabled, error, className },
    ref
  ) => {
    // Convert options to items format for Base UI
    const items = options.map((opt) => ({ value: opt.value, label: opt.label }))

    return (
      <div className={className}>
        <BaseSelect.Root
          value={value}
          onValueChange={(newValue) => {
            if (onValueChange && typeof newValue === 'string') {
              onValueChange(newValue)
            }
          }}
          disabled={disabled}
          items={items}
        >
          <BaseSelect.Trigger
            ref={ref}
            className={cn(
              'flex h-9 w-full items-center justify-between',
              'whitespace-nowrap rounded-md border border-input',
              'bg-transparent px-3 py-2 text-sm shadow-sm',
              'ring-offset-background',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              '[&>span]:line-clamp-1',
              error && 'border-destructive'
            )}
          >
            <BaseSelect.Value
              placeholder={placeholder}
              className="text-foreground data-[placeholder]:text-foreground-faint"
            />
            <BaseSelect.Icon>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </BaseSelect.Icon>
          </BaseSelect.Trigger>
          <BaseSelect.Portal>
            <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false}>
              <BaseSelect.Popup
                className={cn(
                  'relative z-50 max-h-96 min-w-[8rem] overflow-hidden',
                  'rounded-md border border-border bg-popover text-popover-foreground shadow-md',
                  // Animation
                  'opacity-0 scale-95',
                  'data-[open]:opacity-100 data-[open]:scale-100',
                  'transition-all duration-fast ease-out',
                  'data-[ending-style]:opacity-0 data-[ending-style]:scale-95'
                )}
              >
                <BaseSelect.ScrollUpArrow className="flex cursor-default items-center justify-center py-1">
                  <ChevronDown className="h-4 w-4 rotate-180" />
                </BaseSelect.ScrollUpArrow>
                <BaseSelect.List className="p-1">
                  {options.map((option) => (
                    <BaseSelect.Item
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      className={cn(
                        'relative flex w-full cursor-default select-none items-center',
                        'rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none',
                        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
                      )}
                    >
                      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                        <BaseSelect.ItemIndicator>
                          <Check className="h-4 w-4" />
                        </BaseSelect.ItemIndicator>
                      </span>
                      <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    </BaseSelect.Item>
                  ))}
                </BaseSelect.List>
                <BaseSelect.ScrollDownArrow className="flex cursor-default items-center justify-center py-1">
                  <ChevronDown className="h-4 w-4" />
                </BaseSelect.ScrollDownArrow>
              </BaseSelect.Popup>
            </BaseSelect.Positioner>
          </BaseSelect.Portal>
        </BaseSelect.Root>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'

// ─── Compound Components (for advanced usage) ───────────────────────

/** Select root - groups all parts */
export const SelectRoot = BaseSelect.Root

/** Select group - groups related items */
export const SelectGroup = BaseSelect.Group

/** Select value - displays the selected value */
export const SelectValue = BaseSelect.Value

/** Select icon - the dropdown indicator */
export const SelectIcon = BaseSelect.Icon

/** Select portal - renders content outside the DOM hierarchy */
export const SelectPortal = BaseSelect.Portal

/** Select positioner - positions the popup relative to trigger */
export const SelectPositioner = BaseSelect.Positioner

/** Select list - container for items */
export const SelectList = BaseSelect.List

/** Select trigger - the button that opens the select */
export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Trigger>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between',
      'whitespace-nowrap rounded-md border border-input',
      'bg-transparent px-3 py-2 text-sm shadow-sm',
      'ring-offset-background',
      'focus:outline-none focus:ring-1 focus:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      '[&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
  </BaseSelect.Trigger>
))
SelectTrigger.displayName = 'SelectTrigger'

/** Select content - the popup container with styling */
export const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Popup> & {
    sideOffset?: number
  }
>(({ className, children, sideOffset = 4, ...props }, ref) => (
  <BaseSelect.Portal>
    <BaseSelect.Positioner sideOffset={sideOffset} alignItemWithTrigger={false}>
      <BaseSelect.Popup
        ref={ref}
        className={cn(
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden',
          'rounded-md border border-border bg-popover text-popover-foreground shadow-md',
          // Animation
          'opacity-0 scale-95',
          'data-[open]:opacity-100 data-[open]:scale-100',
          'transition-all duration-fast ease-out',
          'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          className
        )}
        {...props}
      >
        <BaseSelect.ScrollUpArrow className="flex cursor-default items-center justify-center py-1">
          <ChevronDown className="h-4 w-4 rotate-180" />
        </BaseSelect.ScrollUpArrow>
        <BaseSelect.List className="p-1">{children}</BaseSelect.List>
        <BaseSelect.ScrollDownArrow className="flex cursor-default items-center justify-center py-1">
          <ChevronDown className="h-4 w-4" />
        </BaseSelect.ScrollDownArrow>
      </BaseSelect.Popup>
    </BaseSelect.Positioner>
  </BaseSelect.Portal>
))
SelectContent.displayName = 'SelectContent'

/** Select scroll up button */
export const SelectScrollUpButton = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.ScrollUpArrow>
>(({ className, ...props }, ref) => (
  <BaseSelect.ScrollUpArrow
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4 rotate-180" />
  </BaseSelect.ScrollUpArrow>
))
SelectScrollUpButton.displayName = 'SelectScrollUpButton'

/** Select scroll down button */
export const SelectScrollDownButton = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.ScrollDownArrow>
>(({ className, ...props }, ref) => (
  <BaseSelect.ScrollDownArrow
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </BaseSelect.ScrollDownArrow>
))
SelectScrollDownButton.displayName = 'SelectScrollDownButton'

/** Select label - label for a group of items */
export const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.GroupLabel>
>(({ className, ...props }, ref) => (
  <BaseSelect.GroupLabel
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', className)}
    {...props}
  />
))
SelectLabel.displayName = 'SelectLabel'

/** Select item - an individual option */
export const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Item>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center',
      'rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <BaseSelect.ItemIndicator>
        <Check className="h-4 w-4" />
      </BaseSelect.ItemIndicator>
    </span>
    <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
  </BaseSelect.Item>
))
SelectItem.displayName = 'SelectItem'

/** Select separator - divider between items */
export const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Separator>
>(({ className, ...props }, ref) => (
  <BaseSelect.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
))
SelectSeparator.displayName = 'SelectSeparator'
