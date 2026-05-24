/**
 * Pure LOD selection for Canvas v3 render tiers.
 */

import type { Rect } from './types'

export type CanvasLodTier = 'live-dom' | 'shell-dom' | 'thumbnail' | 'vector-tile' | 'raster-tile'

export type LodBudgets = {
  liveDomRemaining: number
  shellDomRemaining: number
}

export type CanvasObjectSummary = {
  id: string
  hasThumbnail: boolean
  tileHasRaster: boolean
}

export type ChooseObjectLodInput = {
  object: CanvasObjectSummary
  screenRect: Rect
  selected: boolean
  focused: boolean
  sourceOpen: boolean
  budgets: LodBudgets
}

export function chooseObjectLod(input: ChooseObjectLodInput): CanvasLodTier {
  if (input.focused || input.sourceOpen) {
    return 'live-dom'
  }

  if (input.selected && input.budgets.shellDomRemaining > 0) {
    return input.screenRect.width > 48 && input.screenRect.height > 32 ? 'shell-dom' : 'thumbnail'
  }

  const screenArea = input.screenRect.width * input.screenRect.height

  if (screenArea >= 96_000 && input.budgets.liveDomRemaining > 0) {
    return 'live-dom'
  }

  if (screenArea >= 12_000 && input.budgets.shellDomRemaining > 0) {
    return 'shell-dom'
  }

  if (screenArea >= 256 && input.object.hasThumbnail) {
    return 'thumbnail'
  }

  return input.object.tileHasRaster ? 'raster-tile' : 'vector-tile'
}
