import { useState, type ReactNode } from 'react'
import { cn } from '../utils'

export interface KeyValueProps {
  label: string
  value: string | ReactNode
  mono?: boolean
  copyable?: boolean
  className?: string
}

export function KeyValue({ label, value, mono, copyable, className }: KeyValueProps) {
  return (
    <div className={cn('flex items-start gap-2 text-[11px] py-0.5', className)}>
      <span className="text-muted-foreground min-w-[80px] shrink-0">{label}</span>
      <span className={cn('text-foreground flex-1 break-all', mono && 'font-mono')}>{value}</span>
      {copyable && typeof value === 'string' && <CopyButton text={value} />}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="text-muted-foreground hover:text-foreground shrink-0"
      title="Copy"
    >
      {copied ? (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
          <path strokeWidth="2" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}
