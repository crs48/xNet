import { Select } from '@xnetjs/ui'

const statusOptions = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'planned', label: 'Planned' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'shipped', label: 'Shipped' }
]

const cadenceOptions = [
  { value: 'daily', label: 'Daily standup' },
  { value: 'weekly', label: 'Weekly review' },
  { value: 'monthly', label: 'Monthly retro' }
]

export const Default = () => (
  <div className="max-w-xs space-y-4">
    <Select options={statusOptions} value="in-progress" />
    <Select options={cadenceOptions} value="weekly" />
  </div>
)

export const Placeholder = () => (
  <div className="max-w-xs">
    <Select options={statusOptions} placeholder="Select a status..." />
  </div>
)

export const States = () => (
  <div className="max-w-xs space-y-4">
    <Select options={statusOptions} value="shipped" />
    <Select options={statusOptions} placeholder="Pick a status" error="Status is required." />
    <Select options={statusOptions} value="backlog" disabled />
  </div>
)
