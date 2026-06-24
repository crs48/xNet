import { Switch } from '@xnetjs/ui'

export const Default = () => (
  <div className="flex flex-wrap items-center gap-6">
    <div className="flex items-center gap-3">
      <Switch checked />
      <span className="text-sm">On</span>
    </div>
    <div className="flex items-center gap-3">
      <Switch />
      <span className="text-sm">Off</span>
    </div>
  </div>
)

export const States = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Switch checked />
      <span className="text-sm">Enabled, on</span>
    </div>
    <div className="flex items-center gap-3">
      <Switch />
      <span className="text-sm">Enabled, off</span>
    </div>
    <div className="flex items-center gap-3">
      <Switch checked disabled />
      <span className="text-sm text-foreground-muted">Disabled, on</span>
    </div>
    <div className="flex items-center gap-3">
      <Switch disabled />
      <span className="text-sm text-foreground-muted">Disabled, off</span>
    </div>
  </div>
)

export const InSettingRow = () => (
  <div className="space-y-3">
    <div className="flex items-center justify-between rounded-lg border border-border bg-background-subtle px-3 py-2">
      <div>
        <p className="text-sm font-medium">Push notifications</p>
        <p className="text-xs text-foreground-muted">Get notified when teammates mention you.</p>
      </div>
      <Switch checked />
    </div>
    <div className="flex items-center justify-between rounded-lg border border-border bg-background-subtle px-3 py-2">
      <div>
        <p className="text-sm font-medium">Offline mode</p>
        <p className="text-xs text-foreground-muted">Cache documents for local-first access.</p>
      </div>
      <Switch />
    </div>
  </div>
)
