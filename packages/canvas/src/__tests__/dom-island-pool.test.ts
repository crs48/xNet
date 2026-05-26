/**
 * Canvas v3 DOM island pool tests.
 */

import type { CanvasObjectKind, CanvasObjectRecord } from '@xnetjs/canvas-core'
import { describe, expect, it } from 'vitest'
import {
  DomIslandPool,
  type DomIslandCandidate,
  planDomIslandPool
} from '../renderer/dom-island-pool'

function createObject(id: string, title = id, kind: CanvasObjectKind = 'page'): CanvasObjectRecord {
  return {
    id,
    kind,
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
      shellRemaining: 0,
      liveIframeUsed: 0,
      liveIframeRemaining: 0
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

  it('plans budgets predictably for mixed page database media and reference objects', () => {
    const plan = planDomIslandPool({
      candidates: [
        createCandidate('page', {
          object: createObject('page', 'Page', 'page'),
          focused: true
        }),
        createCandidate('database', {
          object: createObject('database', 'Database', 'database'),
          editing: true
        }),
        createCandidate('media', {
          object: createObject('media', 'Image', 'media'),
          screenRect: { x: 0, y: 0, width: 520, height: 280 }
        }),
        createCandidate('reference', {
          object: createObject('reference', 'YouTube', 'external-reference'),
          selected: true
        }),
        createCandidate('note', {
          object: createObject('note', 'Note', 'note'),
          screenRect: { x: 0, y: 0, width: 180, height: 120 }
        })
      ],
      budgets: { maxLiveDom: 2, maxShellDom: 3 },
      nowMs: 1_000
    })

    expect(plan.liveObjects.map((object) => [object.id, object.kind])).toEqual([
      ['page', 'page'],
      ['database', 'database']
    ])
    expect(plan.shellObjects.map((object) => [object.id, object.kind])).toEqual([
      ['reference', 'external-reference'],
      ['media', 'media'],
      ['note', 'note']
    ])
    expect(plan.parkedObjectIds).toEqual([])
    expect(plan.budgets).toEqual({
      liveUsed: 2,
      liveRemaining: 0,
      shellUsed: 3,
      shellRemaining: 0,
      liveIframeUsed: 0,
      liveIframeRemaining: 0
    })
  })

  it('budgets live iframes separately from live DOM documents', () => {
    const plan = planDomIslandPool({
      candidates: [
        createCandidate('page', {
          object: createObject('page', 'Focused page', 'page'),
          focused: true
        }),
        createCandidate('youtube', {
          object: createObject('youtube', 'YouTube', 'external-reference'),
          selected: true,
          liveIframe: true,
          screenRect: { x: 0, y: 0, width: 420, height: 280 }
        }),
        createCandidate('spotify', {
          object: createObject('spotify', 'Spotify', 'external-reference'),
          selected: true,
          liveIframe: true,
          screenRect: { x: 0, y: 0, width: 360, height: 300 }
        }),
        createCandidate('figma', {
          object: createObject('figma', 'Figma', 'external-reference'),
          selected: true,
          liveIframe: true,
          screenRect: { x: 0, y: 0, width: 320, height: 220 }
        })
      ],
      budgets: { maxLiveDom: 1, maxShellDom: 3, maxLiveIframes: 2 },
      nowMs: 1_000
    })

    expect(plan.liveObjects.map((object) => object.id)).toEqual(['page'])
    expect(plan.shellObjects.map((object) => object.id)).toEqual(['youtube', 'spotify', 'figma'])
    expect(plan.liveIframeObjects.map((object) => object.id)).toEqual(['youtube', 'spotify'])
    expect(plan.liveIframeAssignments.map((assignment) => assignment.reasons)).toEqual([
      ['live-iframe', 'selected'],
      ['live-iframe', 'selected']
    ])
    expect(plan.budgets).toEqual({
      liveUsed: 1,
      liveRemaining: 0,
      shellUsed: 3,
      shellRemaining: 0,
      liveIframeUsed: 2,
      liveIframeRemaining: 0
    })
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
