import { DatePicker } from '@xnetjs/ui'

// DatePicker is a self-contained popover that opens only on click via internal useState
// (no `defaultOpen` prop), so the calendar panel cannot be shown statically. The card
// grades the closed trigger in its meaningful states (selected value / placeholder / disabled).
const noop = () => undefined

export const Default = () => (
  <div className="max-w-md space-y-4">
    <DatePicker value={new Date('2026-03-09T12:00:00')} onChange={noop} />
  </div>
)

export const Placeholder = () => (
  <div className="max-w-md space-y-4">
    <DatePicker value={null} onChange={noop} placeholder="Select a due date" />
  </div>
)

export const WithLabel = () => (
  <div className="max-w-md space-y-4">
    <label className="block text-sm font-medium text-foreground">Due date</label>
    <DatePicker value={new Date('2026-06-30T12:00:00')} onChange={noop} />
    <p className="text-sm text-foreground-muted">Click to open the calendar and pick a day.</p>
  </div>
)

export const Disabled = () => (
  <div className="max-w-md space-y-4">
    <DatePicker value={new Date('2026-01-15T12:00:00')} onChange={noop} disabled />
  </div>
)
