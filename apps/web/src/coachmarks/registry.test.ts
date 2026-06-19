import { afterEach, describe, expect, it } from 'vitest'
import {
  __clearRegistry,
  contributeTips,
  selectUnseenTips,
  tipsForView,
  type CoachTip
} from './registry'

const tip = (over: Partial<CoachTip> & Pick<CoachTip, 'id' | 'view'>): CoachTip => ({
  anchor: '[data-coach="x"]',
  title: 'T',
  body: 'B',
  ...over
})

describe('coachmark registry', () => {
  afterEach(() => __clearRegistry())

  it('returns only tips for the requested view', () => {
    contributeTips([tip({ id: 'a@1', view: 'crm' }), tip({ id: 'b@1', view: 'tasks' })])
    expect(tipsForView('crm').map((t) => t.id)).toEqual(['a@1'])
    expect(tipsForView('tasks').map((t) => t.id)).toEqual(['b@1'])
    expect(tipsForView('home')).toEqual([])
  })

  it('orders tips within a view by `order` then registration', () => {
    contributeTips([
      tip({ id: 'late@1', view: 'crm', order: 2 }),
      tip({ id: 'early@1', view: 'crm', order: 1 }),
      tip({ id: 'default@1', view: 'crm' })
    ])
    expect(tipsForView('crm').map((t) => t.id)).toEqual(['default@1', 'early@1', 'late@1'])
  })

  it('re-registering an id overwrites it (idempotent)', () => {
    contributeTips([tip({ id: 'a@1', view: 'crm', title: 'first' })])
    contributeTips([tip({ id: 'a@1', view: 'crm', title: 'second' })])
    expect(tipsForView('crm')).toHaveLength(1)
    expect(tipsForView('crm')[0].title).toBe('second')
  })

  it('the disposer removes exactly the contributed tips', () => {
    const dispose = contributeTips([tip({ id: 'a@1', view: 'crm' })])
    expect(tipsForView('crm')).toHaveLength(1)
    dispose()
    expect(tipsForView('crm')).toHaveLength(0)
  })

  it('selectUnseenTips filters out dismissed ids and preserves order', () => {
    contributeTips([
      tip({ id: 'a@1', view: 'crm', order: 1 }),
      tip({ id: 'b@1', view: 'crm', order: 2 })
    ])
    expect(selectUnseenTips('crm', new Set()).map((t) => t.id)).toEqual(['a@1', 'b@1'])
    expect(selectUnseenTips('crm', new Set(['a@1'])).map((t) => t.id)).toEqual(['b@1'])
    expect(selectUnseenTips('crm', new Set(['a@1', 'b@1']))).toEqual([])
  })

  it('bumping a versioned id re-surfaces the tip for someone who saw the old one', () => {
    contributeTips([tip({ id: 'crm:overview@2', view: 'crm' })])
    // The user dismissed @1 previously; @2 is a different id, so it shows again.
    expect(selectUnseenTips('crm', new Set(['crm:overview@1']))).toHaveLength(1)
  })
})
