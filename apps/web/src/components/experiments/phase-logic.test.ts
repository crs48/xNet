import { isoToDay } from '@xnetjs/experiments'
import { describe, expect, it } from 'vitest'
import {
  confoundDaysInWindow,
  parsePhases,
  partitionByPhase,
  phaseForDay,
  type PhaseDef
} from './phase-logic'

const day = (iso: string) => isoToDay(iso) as number

const phases: PhaseDef[] = [
  { label: 'Baseline', kind: 'baseline', start: day('2026-06-01'), end: day('2026-06-07') },
  { label: 'Intervention', kind: 'intervention', start: day('2026-06-08'), end: day('2026-06-14') }
]

describe('phase-logic', () => {
  it('parses defensive json into sorted phase defs', () => {
    const parsed = parsePhases([
      { label: 'B', kind: 'intervention', start: day('2026-06-08') },
      { label: 'A', kind: 'baseline', start: day('2026-06-01'), end: day('2026-06-07') },
      { junk: true }
    ])
    expect(parsed.map((p) => p.kind)).toEqual(['baseline', 'intervention'])
    expect(parsed[1].end).toBeNull()
  })

  it('maps a day to its phase, none outside', () => {
    expect(phaseForDay(day('2026-06-03'), phases)).toBe('baseline')
    expect(phaseForDay(day('2026-06-10'), phases)).toBe('intervention')
    expect(phaseForDay(day('2026-05-30'), phases)).toBe('none')
  })

  it('partitions observation values by phase via date ranges', () => {
    const observations = [
      { day: day('2026-06-02'), value: 5 },
      { day: day('2026-06-05'), value: 6 },
      { day: day('2026-06-10'), value: 9 },
      { day: day('2026-06-12'), value: 8 },
      { day: day('2026-05-01'), value: 99 } // outside every phase → ignored
    ]
    const parts = partitionByPhase(observations, phases)
    expect(parts.baseline).toEqual([5, 6])
    expect(parts.intervention).toEqual([9, 8])
  })

  it('counts confound days inside the phase window', () => {
    const observations = [
      { day: day('2026-06-10'), value: 9, confounds: ['alcohol'] },
      { day: day('2026-06-11'), value: 8, confounds: [] },
      { day: day('2026-05-01'), value: 1, confounds: ['travel'] } // outside → ignored
    ]
    expect(confoundDaysInWindow(observations, phases)).toBe(1)
  })
})
