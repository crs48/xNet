import { Badge, Button, Presence } from '@xnetjs/ui'
import { CheckCircle2, Sparkles } from 'lucide-react'

// <Presence> is a near-zero-runtime enter/exit animation wrapper: while `show`
// is true the child is mounted (enter keyframe); when it flips false the child
// stays mounted through the exit keyframe and only unmounts on animationend.
// A static card renders it with `show` true so the wrapped content is visible —
// here a toast-style notification and an upsell banner.

export const Toast = () => (
  <div className="max-w-xl">
    <Presence show motion="slide-up" wrapperProps={{ role: 'status', 'aria-live': 'polite' }}>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-4 shadow">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
        <div className="flex-1">
          <p className="text-sm font-medium">Changes saved</p>
          <p className="text-sm text-foreground-muted">
            Your document synced across all connected devices.
          </p>
        </div>
        <Badge variant="success" dot>
          Synced
        </Badge>
      </div>
    </Presence>
  </div>
)

export const Banner = () => (
  <div className="max-w-xl">
    <Presence show motion="scale">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background-subtle p-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">New: graph-aware AI retrieval</p>
            <p className="text-sm text-foreground-muted">
              Answers now draw on linked documents automatically.
            </p>
          </div>
        </div>
        <Button size="sm">Try it</Button>
      </div>
    </Presence>
  </div>
)
