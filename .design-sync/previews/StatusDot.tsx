import { StatusDot } from '@xnetjs/ui'

export const Statuses = () => (
  <div className="flex flex-col gap-3 text-sm">
    <StatusDot status="connected" label="Connected" />
    <StatusDot status="syncing" label="Syncing" />
    <StatusDot status="synced" label="Synced" />
    <StatusDot status="connecting" label="Connecting" />
    <StatusDot status="disconnected" label="Disconnected" />
    <StatusDot status="error" label="Error" />
  </div>
)

export const Sizes = () => (
  <div className="flex items-center gap-6 text-sm">
    <StatusDot status="connected" label="Small" size="sm" />
    <StatusDot status="connected" label="Medium" size="md" />
    <StatusDot status="connected" label="Large" size="lg" />
  </div>
)

export const DotsOnly = () => (
  <div className="flex items-center gap-4">
    <StatusDot status="connected" />
    <StatusDot status="syncing" />
    <StatusDot status="error" />
    <StatusDot status="disconnected" />
  </div>
)
