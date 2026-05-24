import { describe, expect, it } from 'vitest'
import { chooseObjectLod } from './lod'

const object = {
  id: 'object-1',
  hasThumbnail: true,
  tileHasRaster: true
}

describe('chooseObjectLod', () => {
  it('keeps focused and open-source objects live regardless of budget', () => {
    expect(
      chooseObjectLod({
        object,
        screenRect: { x: 0, y: 0, width: 4, height: 4 },
        selected: false,
        focused: true,
        sourceOpen: false,
        budgets: { liveDomRemaining: 0, shellDomRemaining: 0 }
      })
    ).toBe('live-dom')
  })

  it('reserves shell DOM budget for readable selected objects', () => {
    expect(
      chooseObjectLod({
        object,
        screenRect: { x: 0, y: 0, width: 80, height: 60 },
        selected: true,
        focused: false,
        sourceOpen: false,
        budgets: { liveDomRemaining: 0, shellDomRemaining: 1 }
      })
    ).toBe('shell-dom')
  })

  it('falls through to thumbnail, raster, or vector tiers from screen size and cache state', () => {
    expect(
      chooseObjectLod({
        object,
        screenRect: { x: 0, y: 0, width: 32, height: 16 },
        selected: false,
        focused: false,
        sourceOpen: false,
        budgets: { liveDomRemaining: 0, shellDomRemaining: 0 }
      })
    ).toBe('thumbnail')

    expect(
      chooseObjectLod({
        object: { ...object, hasThumbnail: false },
        screenRect: { x: 0, y: 0, width: 8, height: 8 },
        selected: false,
        focused: false,
        sourceOpen: false,
        budgets: { liveDomRemaining: 0, shellDomRemaining: 0 }
      })
    ).toBe('raster-tile')

    expect(
      chooseObjectLod({
        object: { ...object, hasThumbnail: false, tileHasRaster: false },
        screenRect: { x: 0, y: 0, width: 8, height: 8 },
        selected: false,
        focused: false,
        sourceOpen: false,
        budgets: { liveDomRemaining: 0, shellDomRemaining: 0 }
      })
    ).toBe('vector-tile')
  })
})
