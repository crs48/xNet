import { ColorPicker } from '@xnetjs/ui'

// ColorPicker is a self-contained popover that opens only on click via internal useState
// (no `defaultOpen` prop), so the swatch grid cannot be shown statically. The card grades
// the closed trigger, which shows the current color swatch + hex value.
const noop = () => undefined

export const Default = () => (
  <div className="flex flex-wrap items-center gap-3">
    <ColorPicker value="#0ea5e9" onChange={noop} />
  </div>
)

export const Swatches = () => (
  <div className="flex flex-wrap items-center gap-3">
    <ColorPicker value="#ef4444" onChange={noop} />
    <ColorPicker value="#22c55e" onChange={noop} />
    <ColorPicker value="#8b5cf6" onChange={noop} />
    <ColorPicker value="#f59e0b" onChange={noop} />
  </div>
)

export const WithLabel = () => (
  <div className="max-w-md space-y-4">
    <label className="block text-sm font-medium text-foreground">Accent color</label>
    <ColorPicker value="#6366f1" onChange={noop} />
    <p className="text-sm text-foreground-muted">
      Applies to highlights, links, and selection across the workspace.
    </p>
  </div>
)
