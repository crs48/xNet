import { Badge } from '@xnetjs/ui'

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Badge>Live</Badge>
    <Badge variant="secondary">Draft</Badge>
    <Badge variant="success">Synced</Badge>
    <Badge variant="warning">Needs review</Badge>
    <Badge variant="outline">Local-only</Badge>
    <Badge variant="destructive">Failed</Badge>
  </div>
)

export const WithDot = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Badge variant="success" dot>
      Online
    </Badge>
    <Badge variant="warning" dot>
      Degraded
    </Badge>
    <Badge variant="secondary" dot>
      Idle
    </Badge>
    <Badge variant="destructive" dot>
      Offline
    </Badge>
  </div>
)

export const Removable = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Badge variant="secondary" removable onRemove={() => undefined}>
      storybook
    </Badge>
    <Badge variant="secondary" removable onRemove={() => undefined}>
      electron
    </Badge>
    <Badge variant="outline" removable onRemove={() => undefined}>
      preview
    </Badge>
  </div>
)
