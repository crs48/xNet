/**
 * Canvas v3 DOM island pool tests.
 */

import type { CanvasObjectRecord } from '@xnetjs/canvas-core'
import { describe, expect, it } from 'vitest'
import {
  DomIslandPool,
  type DomIslandCandidate,
  planDomIslandPool
} from '../renderer/dom-island-pool'

function createObject(id: string, title = id): CanvasObjectRecord {
  return {
    id,
    kind: 'page',
    position: { x: 0, y: 0, width: 400, height: 240 },
    display: {},
    preview: { title }
  }
}

function createCandidate(
  id: string,
  overrides: Partial<DomIslandCandidate> = {}
): DomIslandCandidate {
  return {
    object: createObject(id),
    screenRect: { x: 0, y: 0, width: 200, height: 120 },
    distanceToViewportCenterPx: 0,
    ...overrides
  }
}

describe('DOM island pool', () => {
  it('reserves live DOM budget for focused, editing, and source-open objects first', () => {
    const plan = planDomIslandPool({
      candidates: [
        createCandidate('large', {
          screenRect: { x: 0, y: 0, width: 500, height: 300 }
        }),
        createCandidate('focused', { focused: true }),
        createCandidate('editing', { editing: true }),
        createCandidate('source-open', { sourceOpen: true })
      ],
      budgets: { maxLiveDom: 2, maxShellDom: 4 },
      nowMs: 1_000
    })

    expect(plan.assignments.filter((assignment) => assignment.tier === 'live-dom')).toEqual([
      expect.objectContaining({ objectId: 'focused', reasons: ['focused'] }),
      expect.objectContaining({ objectId: 'source-open', reasons: ['source-open'] })
    ])
    expect(plan.budgets.liveUsed).toBe(2)
  })

  it('fills shell DOM budget with selected and readable objects after live assignments', () => {
    const plan = planDomIslandPool({
      candidates: [
        createCandidate('focused', { focused: true }),
        createCandidate('selected', { selected: true }),
        createCandidate('readable', {
          screenRect: { x: 0, y: 0, width: 180, height: 100 }
        }),
        createCandidate('tiny', {
          object: createObject('tiny', ''),
          screenRect: { x: 0, y: 0, width: 20, height: 20 }
        })
      ],
      budgets: { maxLiveDom: 1, maxShellDom: 2 },
      nowMs: 1_000
    })

    expect(plan.liveObjects.map((object) => object.id)).toEqual(['focused'])
    expect(plan.shellObjects.map((object) => object.id)).toEqual(['selected', 'readable'])
    expect(plan.parkedObjectIds).toEqual(['tiny'])
    expect(plan.budgets).toEqual({
      liveUsed: 1,
      liveRemaining: 0,
      shellUsed: 2,
      shellRemaining: 0
    })
  })

  it('uses distance and recency as deterministic priority tie breakers', () => {
    const plan = planDomIslandPool({
      candidates: [
        createCandidate('far', {
          selected: true,
          distanceToViewportCenterPx: 4_000,
          lastInteractionAtMs: 800
        }),
        createCandidate('near', {
          selected: true,
          distanceToViewportCenterPx: 100,
          lastInteractionAtMs: 800
        }),
        createCandidate('recent', {
          selected: true,
          distanceToViewportCenterPx: 4_000,
          lastInteractionAtMs: 995
        })
      ],
      budgets: { maxLiveDom: 0, maxShellDom: 2 },
      nowMs: 1_000
    })

    expect(plan.shellObjects.map((object) => object.id)).toEqual(['recent', 'near'])
  })

  it('reports mount, tier-update, and unmount operations for pool reconciliation', () => {
    const pool = new DomIslandPool()
    const first = pool.plan({
      candidates: [createCandidate('a'), createCandidate('b')],
      budgets: { maxLiveDom: 0, maxShellDom: 2 },
      nowMs: 1_000
    })
    const second = pool.plan({
      candidates: [createCandidate('a', { focused: true }), createCandidate('c')],
      budgets: { maxLiveDom: 1, maxShellDom: 1 },
      nowMs: 2_000
    })

    expect(first.mount.map((assignment) => assignment.objectId)).toEqual(['a', 'b'])
    expect(second.mount.map((assignment) => assignment.objectId)).toEqual(['c'])
    expect(second.update.map((assignment) => [assignment.objectId, assignment.tier])).toEqual([
      ['a', 'live-dom']
    ])
    expect(second.unmount.map((assignment) => assignment.objectId)).toEqual(['b'])
    expect(pool.getMountedObjectIds()).toEqual(['a', 'c'])
  })
})
