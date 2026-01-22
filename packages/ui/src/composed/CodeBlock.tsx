import { cn } from '../utils'
import { ScrollArea } from '../primitives/ScrollArea'

export interface CodeBlockProps {
  code: string
  language?: string
  maxHeight?: number
  className?: string
}

export function CodeBlock({ code, maxHeight = 200, className }: CodeBlockProps) {
  return (
    <ScrollArea className={cn('rounded-md', className)} style={{ maxHeight }}>
      <pre className="bg-muted/50 rounded-md p-3 text-[11px] font-mono overflow-x-auto">
        <code className="text-foreground whitespace-pre-wrap break-all">{code}</code>
      </pre>
    </ScrollArea>
  )
}
