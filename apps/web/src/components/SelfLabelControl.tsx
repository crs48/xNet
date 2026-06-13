/**
 * SelfLabelControl (exploration 0175) — author self-labeling.
 *
 * "Mark sensitive" control attached to authored content. Self-labels are the
 * highest-precision signal and the politest UX: the author declares, the viewer
 * filters. One tap writes a ModerationLabel.
 */
import { sensitivityLabels, type SensitivityLabelValue } from '@xnetjs/abuse'
import { useState } from 'react'
import { useSelfLabel } from '../lib/self-label'

export interface SelfLabelControlProps {
  targetId: string
}

export function SelfLabelControl({ targetId }: SelfLabelControlProps) {
  const { selfLabel } = useSelfLabel()
  const [marked, setMarked] = useState<SensitivityLabelValue[]>([])

  const mark = async (value: SensitivityLabelValue) => {
    await selfLabel(targetId, value)
    setMarked((current) => (current.includes(value) ? current : [...current, value]))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Mark sensitive:</span>
      {sensitivityLabels.map((label) => {
        const isMarked = marked.includes(label.id)
        return (
          <button
            key={label.id}
            type="button"
            disabled={isMarked}
            onClick={() => void mark(label.id)}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              isMarked
                ? 'border-accent bg-accent text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent/50'
            }`}
          >
            {label.name}
            {isMarked ? ' ✓' : ''}
          </button>
        )
      })}
    </div>
  )
}
