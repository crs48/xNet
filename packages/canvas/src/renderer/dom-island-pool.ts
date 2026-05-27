/**
 * Canvas v3 DOM island pool planning.
 */

import type { CanvasLodTier, CanvasObjectRecord, Rect } from '@xnetjs/canvas-core'

export type DomIslandTier = Extract<CanvasLodTier, 'live-dom' | 'shell-dom'>

export type DomIslandCandidate = {
  object: CanvasObjectRecord
  screenRect: Rect
  selected?: boolean
  focused?: boolean
  sourceOpen?: boolean
  editing?: boolean
  liveIframe?: boolean
  distanceToViewportCenterPx?: number
  lastInteractionAtMs?: number
}

export type DomIslandPoolBudgets = {
  maxLiveDom: number
  maxShellDom: number
  maxLiveIframes?: number
}

export type DomIslandAssignment = {
  objectId: string
  object: CanvasObjectRecord
  tier: DomIslandTier
  priority: number
  reasons: readonly string[]
}

export type DomIslandIframeAssignment = {
  objectId: string
  object: CanvasObjectRecord
  priority: number
  reasons: readonly string[]
}

export type DomIslandPoolPlan = {
  liveObjects: readonly CanvasObjectRecord[]
  shellObjects: readonly CanvasObjectRecord[]
  liveIframeObjects: readonly CanvasObjectRecord[]
  assignments: readonly DomIslandAssignment[]
  liveIframeAssignments: readonly DomIslandIframeAssignment[]
  parkedObjectIds: readonly string[]
  budgets: {
    liveUsed: number
    liveRemaining: number
    shellUsed: number
    shellRemaining: number
    liveIframeUsed: number
    liveIframeRemaining: number
  }
}

export type PlanDomIslandPoolInput = {
  candidates: readonly DomIslandCandidate[]
  budgets: DomIslandPoolBudgets
  nowMs?: number
}

export type DomIslandPoolUpdate = {
  mount: readonly DomIslandAssignment[]
  update: readonly DomIslandAssignment[]
  unmount: readonly DomIslandAssignment[]
  plan: DomIslandPoolPlan
}

type ScoredDomIslandCandidate = {
  candidate: DomIslandCandidate
  livePriority: number
  shellPriority: number
  liveIframePriority: number
  liveReasons: readonly string[]
  shellReasons: readonly string[]
  liveIframeReasons: readonly string[]
}

const LIVE_AREA_THRESHOLD = 96_000
const SHELL_AREA_THRESHOLD = 12_000
const RECENT_INTERACTION_WINDOW_MS = 4_000

function getArea(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height)
}

function getDistancePenalty(candidate: DomIslandCandidate): number {
  return Math.min(candidate.distanceToViewportCenterPx ?? 0, 20_000) / 100
}

function getRecencyBoost(candidate: DomIslandCandidate, nowMs: number): number {
  if (candidate.lastInteractionAtMs === undefined) {
    return 0
  }

  const ageMs = nowMs - candidate.lastInteractionAtMs
  if (ageMs < 0 || ageMs > RECENT_INTERACTION_WINDOW_MS) {
    return 0
  }

  return 2_000 * (1 - ageMs / RECENT_INTERACTION_WINDOW_MS)
}

function getLiveReasons(candidate: DomIslandCandidate, area: number): string[] {
  return [
    candidate.focused ? 'focused' : null,
    candidate.sourceOpen ? 'source-open' : null,
    candidate.editing ? 'editing' : null,
    candidate.selected && area >= LIVE_AREA_THRESHOLD ? 'selected-large' : null,
    area >= LIVE_AREA_THRESHOLD ? 'large-screen-area' : null
  ].filter((reason): reason is string => reason !== null)
}

function getShellReasons(candidate: DomIslandCandidate, area: number): string[] {
  return [
    candidate.liveIframe ? 'iframe-shell' : null,
    candidate.selected ? 'selected' : null,
    area >= SHELL_AREA_THRESHOLD ? 'readable-screen-area' : null,
    candidate.object.preview.title ? 'has-title' : null
  ].filter((reason): reason is string => reason !== null)
}

function getLiveIframeReasons(candidate: DomIslandCandidate): string[] {
  return [
    candidate.liveIframe ? 'live-iframe' : null,
    candidate.focused ? 'focused' : null,
    candidate.selected ? 'selected' : null,
    candidate.editing ? 'editing' : null
  ].filter((reason): reason is string => reason !== null)
}

function scoreLiveCandidate(
  candidate: DomIslandCandidate,
  reasons: readonly string[],
  area: number,
  nowMs: number
): number {
  if (reasons.length === 0) {
    return 0
  }

  return (
    (candidate.focused ? 100_000 : 0) +
    (candidate.sourceOpen ? 90_000 : 0) +
    (candidate.editing ? 80_000 : 0) +
    (candidate.selected ? 30_000 : 0) +
    Math.min(area / 8, 20_000) +
    getRecencyBoost(candidate, nowMs) -
    getDistancePenalty(candidate)
  )
}

function scoreShellCandidate(
  candidate: DomIslandCandidate,
  reasons: readonly string[],
  area: number,
  nowMs: number
): number {
  if (reasons.length === 0) {
    return 0
  }

  return (
    (candidate.selected ? 20_000 : 0) +
    (candidate.object.preview.title ? 4_000 : 0) +
    Math.min(area / 12, 12_000) +
    getRecencyBoost(candidate, nowMs) -
    getDistancePenalty(candidate)
  )
}

function scoreLiveIframeCandidate(
  candidate: DomIslandCandidate,
  reasons: readonly string[],
  area: number,
  nowMs: number
): number {
  if (reasons.length === 0 || candidate.liveIframe !== true) {
    return 0
  }

  return (
    (candidate.focused ? 70_000 : 0) +
    (candidate.selected ? 45_000 : 0) +
    (candidate.editing ? 35_000 : 0) +
    Math.min(area / 10, 18_000) +
    getRecencyBoost(candidate, nowMs) -
    getDistancePenalty(candidate)
  )
}

function scoreCandidate(candidate: DomIslandCandidate, nowMs: number): ScoredDomIslandCandidate {
  const area = getArea(candidate.screenRect)
  const liveReasons = getLiveReasons(candidate, area)
  const shellReasons = getShellReasons(candidate, area)
  const liveIframeReasons = getLiveIframeReasons(candidate)

  return {
    candidate,
    livePriority: scoreLiveCandidate(candidate, liveReasons, area, nowMs),
    shellPriority: scoreShellCandidate(candidate, shellReasons, area, nowMs),
    liveIframePriority: scoreLiveIframeCandidate(candidate, liveIframeReasons, area, nowMs),
    liveReasons,
    shellReasons,
    liveIframeReasons
  }
}

function sortScoredCandidates(
  candidates: readonly ScoredDomIslandCandidate[],
  getPriority: (candidate: ScoredDomIslandCandidate) => number
): ScoredDomIslandCandidate[] {
  return [...candidates].sort((left, right) => {
    const priorityDelta = getPriority(right) - getPriority(left)
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return left.candidate.object.id.localeCompare(right.candidate.object.id)
  })
}

export function planDomIslandPool(input: PlanDomIslandPoolInput): DomIslandPoolPlan {
  const nowMs = input.nowMs ?? performance.now()
  const maxLiveDom = Math.max(0, input.budgets.maxLiveDom)
  const maxShellDom = Math.max(0, input.budgets.maxShellDom)
  const maxLiveIframes = Math.max(0, input.budgets.maxLiveIframes ?? 0)
  const scoredCandidates = input.candidates.map((candidate) => scoreCandidate(candidate, nowMs))
  const liveAssignments = sortScoredCandidates(
    scoredCandidates.filter((candidate) => candidate.livePriority > 0),
    (candidate) => candidate.livePriority
  )
    .slice(0, maxLiveDom)
    .map(
      (candidate): DomIslandAssignment => ({
        objectId: candidate.candidate.object.id,
        object: candidate.candidate.object,
        tier: 'live-dom',
        priority: candidate.livePriority,
        reasons: candidate.liveReasons
      })
    )
  const liveObjectIds = new Set(liveAssignments.map((assignment) => assignment.objectId))
  const shellAssignments = sortScoredCandidates(
    scoredCandidates.filter(
      (candidate) =>
        candidate.shellPriority > 0 && !liveObjectIds.has(candidate.candidate.object.id)
    ),
    (candidate) => candidate.shellPriority
  )
    .slice(0, maxShellDom)
    .map(
      (candidate): DomIslandAssignment => ({
        objectId: candidate.candidate.object.id,
        object: candidate.candidate.object,
        tier: 'shell-dom',
        priority: candidate.shellPriority,
        reasons: candidate.shellReasons
      })
    )
  const assignedObjectIds = new Set(
    [...liveAssignments, ...shellAssignments].map((assignment) => assignment.objectId)
  )
  const liveIframeAssignments = sortScoredCandidates(
    scoredCandidates.filter(
      (candidate) =>
        candidate.liveIframePriority > 0 && assignedObjectIds.has(candidate.candidate.object.id)
    ),
    (candidate) => candidate.liveIframePriority
  )
    .slice(0, maxLiveIframes)
    .map(
      (candidate): DomIslandIframeAssignment => ({
        objectId: candidate.candidate.object.id,
        object: candidate.candidate.object,
        priority: candidate.liveIframePriority,
        reasons: candidate.liveIframeReasons
      })
    )

  return {
    liveObjects: liveAssignments.map((assignment) => assignment.object),
    shellObjects: shellAssignments.map((assignment) => assignment.object),
    liveIframeObjects: liveIframeAssignments.map((assignment) => assignment.object),
    assignments: [...liveAssignments, ...shellAssignments],
    liveIframeAssignments,
    parkedObjectIds: input.candidates
      .map((candidate) => candidate.object.id)
      .filter((objectId) => !assignedObjectIds.has(objectId)),
    budgets: {
      liveUsed: liveAssignments.length,
      liveRemaining: maxLiveDom - liveAssignments.length,
      shellUsed: shellAssignments.length,
      shellRemaining: maxShellDom - shellAssignments.length,
      liveIframeUsed: liveIframeAssignments.length,
      liveIframeRemaining: maxLiveIframes - liveIframeAssignments.length
    }
  }
}

export class DomIslandPool {
  private assignments = new Map<string, DomIslandAssignment>()

  plan(input: PlanDomIslandPoolInput): DomIslandPoolUpdate {
    const plan = planDomIslandPool(input)
    const nextAssignments = new Map(
      plan.assignments.map((assignment) => [assignment.objectId, assignment])
    )
    const mount = plan.assignments.filter(
      (assignment) => !this.assignments.has(assignment.objectId)
    )
    const update = plan.assignments.filter((assignment) => {
      const previous = this.assignments.get(assignment.objectId)
      return previous !== undefined && previous.tier !== assignment.tier
    })
    const unmount = Array.from(this.assignments.values()).filter(
      (assignment) => !nextAssignments.has(assignment.objectId)
    )

    this.assignments = nextAssignments

    return {
      mount,
      update,
      unmount,
      plan
    }
  }

  getMountedObjectIds(tier?: DomIslandTier): string[] {
    return Array.from(this.assignments.values())
      .filter((assignment) => tier === undefined || assignment.tier === tier)
      .map((assignment) => assignment.objectId)
  }
}
