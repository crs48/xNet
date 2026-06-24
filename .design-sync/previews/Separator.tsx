import { Separator } from '@xnetjs/ui'

export const Horizontal = () => (
  <div className="max-w-sm">
    <div className="space-y-1">
      <h4 className="text-sm font-medium">Workspace settings</h4>
      <p className="text-sm text-foreground-muted">Manage members, billing, and integrations.</p>
    </div>
    <Separator className="my-4" />
    <div className="space-y-1">
      <h4 className="text-sm font-medium">Danger zone</h4>
      <p className="text-sm text-foreground-muted">Delete or transfer this workspace.</p>
    </div>
  </div>
)

export const Vertical = () => (
  <div className="flex h-6 items-center gap-3 text-sm">
    <span>Overview</span>
    <Separator orientation="vertical" />
    <span>Activity</span>
    <Separator orientation="vertical" />
    <span>Settings</span>
  </div>
)

export const InToolbar = () => (
  <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background-subtle px-3 text-sm">
    <span className="font-medium">Edit</span>
    <span className="text-foreground-muted">Selection</span>
    <Separator orientation="vertical" className="mx-1" />
    <span className="text-foreground-muted">View</span>
    <span className="text-foreground-muted">Insert</span>
  </div>
)
