/**
 * DashboardVariablesBar - The dashboard-level variable controls (v1: time
 * range). Changing a value re-interpolates and re-subscribes every bound
 * widget query.
 */

import type { DashboardTimeRange, DashboardVariablesState } from '@xnetjs/data'
import { Clock } from 'lucide-react'

const PRESETS: Array<{ value: DashboardTimeRange | null; label: string }> = [
  { value: null, label: 'All time' },
  { value: { kind: 'preset', preset: 'today' }, label: 'Today' },
  { value: { kind: 'preset', preset: '7d' }, label: 'Last 7 days' },
  { value: { kind: 'preset', preset: '30d' }, label: 'Last 30 days' },
  { value: { kind: 'preset', preset: '90d' }, label: 'Last 90 days' }
]

function presetKey(range: DashboardTimeRange | null | undefined): string {
  if (!range || (range.kind === 'preset' && range.preset === 'all')) return 'all'
  if (range.kind === 'preset') return range.preset
  return 'absolute'
}

export interface DashboardVariablesBarProps {
  variables: DashboardVariablesState | undefined
  onChange: (next: DashboardVariablesState) => void
}

export function DashboardVariablesBar({
  variables,
  onChange
}: DashboardVariablesBarProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Clock size={14} className="text-muted-foreground" aria-hidden />
      <select
        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
        aria-label="Time range"
        value={presetKey(variables?.timeRange)}
        onChange={(event) => {
          const preset = PRESETS.find(
            (candidate) => presetKey(candidate.value) === event.target.value
          )
          onChange({
            ...variables,
            timeRange: preset?.value ?? undefined
          })
        }}
      >
        {PRESETS.map((preset) => (
          <option key={preset.label} value={presetKey(preset.value)}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  )
}
