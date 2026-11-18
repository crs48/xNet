import { Dialog, DialogContent, DialogTitle, TabsContent, Tooltip } from '@xnetjs/ui'
import { ArrowUpRight } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
  type RefObject
} from 'react'
import { initials } from './model'
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-medium tracking-tight ${large ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-xs'}`}
    >
      {initials(name)}
    </span>
  )
}
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function IconButton({ label, children, ...props }, ref) {
  return (
    <Tooltip content={label} className="community-tooltip" delayDuration={450}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        {...props}
        className={`chat-icon-button inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${props.className ?? ''}`}
      >
        {children}
      </button>
    </Tooltip>
  )
})
export const primaryButton =
  'chat-button-primary inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed'
export const secondaryButton =
  'chat-button-secondary inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-40'
export const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
export function Modal({
  title,
  children,
  onClose,
  size = 'default',
  footer,
  finalFocus
}: {
  size?: 'default' | 'wide'
  footer?: ReactNode
  finalFocus?: RefObject<HTMLElement | null>
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const returnFocus = useRef(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  )
  const focusTarget = finalFocus ?? returnFocus
  useEffect(() => {
    const target = focusTarget.current
    return () => {
      queueMicrotask(() => {
        if (
          target?.isConnected &&
          (!document.activeElement || document.activeElement === document.body)
        )
          target.focus({ preventScroll: true })
      })
    }
  }, [focusTarget])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        finalFocus={focusTarget}
        className={`community-modal ${size === 'wide' ? '!w-[min(960px,calc(100vw-32px))]' : '!w-[min(520px,calc(100vw-32px))]'} !max-w-none !max-h-[calc(100vh-32px)] !flex !flex-col !gap-0 !rounded-2xl !p-0`}
      >
        <div className="shrink-0 border-b border-border px-6 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
        </div>
        <div className="min-h-0 max-h-[min(75vh,720px)] overflow-y-auto p-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-border px-6 py-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  )
}

/** Keep panel IDs mounted so every tab has a stable accessible relationship. */
export function ChatTabPanels({
  value,
  values,
  children,
  className = '',
  disabled = false
}: {
  value: string
  values: readonly string[]
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  if (disabled) return <div className={`min-h-0 ${className}`}>{children}</div>
  return values.map((item) => (
    <TabsContent
      key={item}
      value={item}
      keepMounted
      className={`!mt-0 min-h-0 outline-none ${className}`}
    >
      {item === value ? children : null}
    </TabsContent>
  ))
}
export function EmptyState({
  icon,
  title,
  description,
  children
}: {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border">
        {icon}
      </div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mb-6 mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {children}
    </div>
  )
}
export function ExternalProfile({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
    >
      {children}
      <ArrowUpRight size={13} />
    </a>
  )
}
