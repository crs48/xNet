import { Checkbox } from '@xnetjs/ui'

export const Default = () => (
  <div className="space-y-3">
    <Checkbox label="Email me a daily summary" defaultChecked />
    <Checkbox label="Subscribe to release notes" />
  </div>
)

export const WithDescription = () => (
  <div className="space-y-4">
    <Checkbox
      checked
      label="Daily summary"
      description="Send a rollout recap every morning at 9am."
    />
    <Checkbox
      label="Experimental filters"
      description="Enable fuzzy ranking and tag weighting in search."
    />
  </div>
)

export const States = () => (
  <div className="space-y-3">
    <Checkbox label="Checked" checked />
    <Checkbox label="Unchecked" />
    <Checkbox label="Indeterminate" indeterminate />
    <Checkbox label="Disabled (checked)" checked disabled />
    <Checkbox label="Disabled (unchecked)" disabled />
  </div>
)
