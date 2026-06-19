import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorkbench } from '../workbench/state'
import { __clearRegistry, contributeTips, type CoachTip } from './registry'
import { resetCoachSession, useCoachmarks } from './useCoachmarks'

const tip = (id: string, view: string, order = 0): CoachTip => ({
  id: id as CoachTip['id'],
  view,
  anchor: '[data-coach="x"]',
  title: id,
  body: 'B',
  order
})

beforeEach(() => {
  __clearRegistry()
  resetCoachSession()
  act(() => useWorkbench.setState({ seenTips: [] }))
})

afterEach(() => __clearRegistry())

describe('workbench store — coachmark seen-state', () => {
  it('markTipSeen appends once (idempotent) and resetTips clears', () => {
    act(() => useWorkbench.getState().markTipSeen('a@1'))
    act(() => useWorkbench.getState().markTipSeen('a@1'))
    expect(useWorkbench.getState().seenTips).toEqual(['a@1'])

    act(() => useWorkbench.getState().markTipSeen('b@1'))
    expect(useWorkbench.getState().seenTips).toEqual(['a@1', 'b@1'])

    act(() => useWorkbench.getState().resetTips())
    expect(useWorkbench.getState().seenTips).toEqual([])
  })
})

describe('useCoachmarks', () => {
  it('shows one unseen tip at a time and advances on dismiss', () => {
    contributeTips([tip('a@1', 'crm', 1), tip('b@1', 'crm', 2)])
    const { result } = renderHook(() => useCoachmarks('crm'))

    expect(result.current.current?.id).toBe('a@1')
    expect(result.current.remaining).toBe(1)

    act(() => result.current.dismiss())
    expect(useWorkbench.getState().seenTips).toContain('a@1')
    expect(result.current.current?.id).toBe('b@1')

    act(() => result.current.dismiss())
    expect(result.current.current).toBeNull()
  })

  it('does not re-show a tip already dismissed in the store', () => {
    contributeTips([tip('a@1', 'crm')])
    act(() => useWorkbench.setState({ seenTips: ['a@1'] }))
    const { result } = renderHook(() => useCoachmarks('crm'))
    expect(result.current.current).toBeNull()
  })

  it('caps the number of brand-new tips surfaced per session', () => {
    contributeTips([tip('a@1', 'crm', 1), tip('b@1', 'crm', 2), tip('c@1', 'crm', 3)])
    const { result } = renderHook(() => useCoachmarks('crm', { max: 2 }))

    expect(result.current.current?.id).toBe('a@1')
    act(() => result.current.dismiss())
    expect(result.current.current?.id).toBe('b@1')
    act(() => result.current.dismiss())
    // Two surfaced this session; the third waits for a future session.
    expect(result.current.current).toBeNull()
  })

  it('shows nothing while disabled, then resumes when enabled', () => {
    contributeTips([tip('a@1', 'crm')])
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCoachmarks('crm', { enabled }),
      { initialProps: { enabled: false } }
    )
    expect(result.current.current).toBeNull()

    rerender({ enabled: true })
    expect(result.current.current?.id).toBe('a@1')
  })
})
