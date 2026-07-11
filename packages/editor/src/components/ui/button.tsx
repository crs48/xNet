/**
 * Vendored from ueberdosis/tiptap-ui-components (MIT © 2025 Tiptap),
 * apps/web/src/components/tiptap-ui-primitive/button — copied, not
 * CLI-managed (0297). Adapted for xNet: SCSS design system replaced with
 * Tailwind tokens, tooltip rendered with @xnetjs/ui Tooltip primitives.
 */
import {
  TooltipPopup,
  TooltipPortal,
  TooltipPositioner,
  TooltipRoot,
  TooltipTrigger
} from '@xnetjs/ui'
import * as React from 'react'
import { cn } from '../../utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  /** Tooltip label; omit (or showTooltip=false) for a bare button. */
  tooltip?: React.ReactNode
  showTooltip?: boolean
  /** Keyboard shortcut rendered as <kbd> chips in the tooltip. */
  shortcutKeys?: string
  /** Highlights the button when its command is active at the selection. */
  active?: boolean
  /** md = desktop toolbar density, lg = touch targets. */
  size?: 'md' | 'lg'
  /** Offset of the tooltip from the trigger. */
  tooltipOffset?: number
}

export const ShortcutDisplay: React.FC<{ shortcuts: string[] }> = ({ shortcuts }) => {
  if (shortcuts.length === 0) return null

  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
      {shortcuts.join('')}
    </kbd>
  )
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      tooltip,
      showTooltip = true,
      shortcutKeys,
      active = false,
      size = 'md',
      tooltipOffset = 8,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const button = (
      <button
        type="button"
        className={cn(
          'flex-shrink-0 flex items-center justify-center rounded text-sm font-medium',
          'transition-colors duration-100',
          'touch-manipulation select-none',
          size === 'lg' ? 'w-10 h-10' : 'w-8 h-8',
          active
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15',
          className
        )}
        ref={ref}
        aria-label={ariaLabel}
        aria-pressed={active || undefined}
        data-active-state={active ? 'on' : 'off'}
        data-shortcut={shortcutKeys}
        {...props}
      >
        {children}
      </button>
    )

    if (!tooltip || !showTooltip) {
      return button
    }

    return (
      <TooltipRoot>
        <TooltipTrigger render={button} />
        <TooltipPortal>
          <TooltipPositioner side="top" sideOffset={tooltipOffset}>
            <TooltipPopup
              data-testid="editor-toolbar-tooltip"
              className={cn(
                'flex items-center gap-2 rounded-md border border-border',
                'bg-popover px-2 py-1.5 text-xs text-popover-foreground',
                'shadow-lg'
              )}
            >
              <span className="font-medium">{tooltip}</span>
              {shortcutKeys && <ShortcutDisplay shortcuts={[shortcutKeys]} />}
            </TooltipPopup>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>
    )
  }
)

Button.displayName = 'Button'

export const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    orientation?: 'horizontal' | 'vertical'
  }
>(({ className, children, orientation = 'horizontal', ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-0.5',
        orientation === 'vertical' && 'flex-col items-stretch',
        className
      )}
      data-orientation={orientation}
      role="group"
      {...props}
    >
      {children}
    </div>
  )
})
ButtonGroup.displayName = 'ButtonGroup'

export default Button
