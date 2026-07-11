/**
 * Vendored from ueberdosis/tiptap-ui-components (MIT © 2025 Tiptap),
 * apps/web/src/components/tiptap-ui-primitive/toolbar — copied, not
 * CLI-managed (0297). Adapted for xNet: SCSS design system replaced with
 * Tailwind tokens; the Separator primitive is inlined as a styled <span>.
 *
 * The Toolbar wires roving keyboard navigation (arrow keys, Home/End)
 * across its focusable items — the accessibility behavior the homegrown
 * toolbar containers lacked.
 */
import * as React from 'react'
import { cn } from '../../utils'
import { useComposedRef } from './use-composed-ref'
import { useMenuNavigation } from './use-menu-navigation'

type BaseProps = React.HTMLAttributes<HTMLDivElement>

interface ToolbarProps extends BaseProps {
  variant?: 'floating' | 'fixed'
}

const useToolbarNavigation = (toolbarRef: React.RefObject<HTMLDivElement | null>) => {
  const [items, setItems] = React.useState<HTMLElement[]>([])

  const collectItems = React.useCallback(() => {
    if (!toolbarRef.current) return []
    return Array.from(
      toolbarRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]:not([disabled])'
      )
    )
  }, [toolbarRef])

  React.useEffect(() => {
    const toolbar = toolbarRef.current
    if (!toolbar) return

    const updateItems = () => setItems(collectItems())

    updateItems()
    const observer = new MutationObserver(updateItems)
    observer.observe(toolbar, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [collectItems, toolbarRef])

  const { selectedIndex } = useMenuNavigation<HTMLElement>({
    containerRef: toolbarRef,
    items,
    orientation: 'horizontal',
    onSelect: (el) => el.click(),
    autoSelectFirstItem: false
  })

  React.useEffect(() => {
    const toolbar = toolbarRef.current
    if (!toolbar) return

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (toolbar.contains(target)) target.setAttribute('data-focus-visible', 'true')
    }

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (toolbar.contains(target)) target.removeAttribute('data-focus-visible')
    }

    toolbar.addEventListener('focus', handleFocus, true)
    toolbar.addEventListener('blur', handleBlur, true)

    return () => {
      toolbar.removeEventListener('focus', handleFocus, true)
      toolbar.removeEventListener('blur', handleBlur, true)
    }
  }, [toolbarRef])

  React.useEffect(() => {
    if (selectedIndex !== undefined && items[selectedIndex]) {
      items[selectedIndex].focus()
    }
  }, [selectedIndex, items])
}

export const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(
  (
    { children, className, variant = 'fixed', 'aria-label': ariaLabel = 'toolbar', ...props },
    ref
  ) => {
    const toolbarRef = React.useRef<HTMLDivElement>(null)
    const composedRef = useComposedRef(toolbarRef, ref)
    useToolbarNavigation(toolbarRef)

    return (
      <div
        ref={composedRef}
        role="toolbar"
        aria-label={ariaLabel}
        data-variant={variant}
        className={cn('flex items-center', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Toolbar.displayName = 'Toolbar'

export const ToolbarGroup = React.forwardRef<HTMLDivElement, BaseProps>(
  ({ children, className, ...props }, ref) => (
    <div ref={ref} role="group" className={cn('flex items-center gap-0.5', className)} {...props}>
      {children}
    </div>
  )
)
ToolbarGroup.displayName = 'ToolbarGroup'

export const ToolbarSeparator = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { size?: 'md' | 'lg' }
>(({ className, size = 'md', ...props }, ref) => (
  <span
    ref={ref}
    role="separator"
    aria-orientation="vertical"
    className={cn(
      'flex-shrink-0 w-px bg-border/60',
      size === 'lg' ? 'h-6 mx-1.5' : 'h-5 mx-1',
      className
    )}
    {...props}
  />
))
ToolbarSeparator.displayName = 'ToolbarSeparator'
