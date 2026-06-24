import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@xnetjs/ui'
import { ChevronDown } from 'lucide-react'

export const Open = () => (
  <Collapsible defaultOpen className="w-full">
    <div className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        Renderer diagnostics
        <ChevronDown className="h-4 w-4 text-foreground-muted" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 px-3 pb-3 text-sm text-foreground-muted">
          <p>GPU layer count, route activity, and workspace preview health.</p>
          <p>Last sampled 12 seconds ago across 4 active panels.</p>
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
)

export const Closed = () => (
  <Collapsible className="w-full">
    <div className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        Advanced options
        <ChevronDown className="h-4 w-4 text-foreground-muted" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 text-sm text-foreground-muted">
          Fine-grained controls for caching, retries, and request batching.
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
)
