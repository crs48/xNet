import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

export function AppDialog({
  title,
  close,
  children,
  feedback,
  className
}: {
  title: string
  close: () => void
  children: ReactNode
  feedback?: string
  className?: string
}) {
  // Several controls can open the same dialog, including items in a portalled menu.
  const [opener] = useState(() => document.activeElement)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        className={className}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          const field =
            event.currentTarget instanceof HTMLElement
              ? event.currentTarget.querySelector<HTMLElement>('[data-initial-focus]')
              : null
          if (field) {
            event.preventDefault()
            field.focus()
          }
        }}
        onCloseAutoFocus={(event) => {
          if (opener instanceof HTMLElement && opener.isConnected) {
            event.preventDefault()
            opener.focus()
          }
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {feedback && (
          <p role="status" className="notice">
            {feedback}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
