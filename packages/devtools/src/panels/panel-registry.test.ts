import { describe, expect, it } from 'vitest'
import {
  ALL_PANEL_IDS,
  DEVTOOLS_PANELS,
  getPanel,
  heroPanels,
  migratePanelId,
  secondaryPanelsByGroup
} from './panel-registry'

describe('panel registry', () => {
  it('has unique panel ids', () => {
    expect(new Set(ALL_PANEL_IDS).size).toBe(ALL_PANEL_IDS.length)
  })

  it('promotes exactly the four hero panels in order', () => {
    expect(heroPanels().map((p) => p.id)).toEqual(['data', 'changes', 'logs', 'performance'])
  })

  it('places every non-hero panel into a group section', () => {
    const grouped = secondaryPanelsByGroup().flatMap((s) => s.panels)
    const secondary = DEVTOOLS_PANELS.filter((p) => p.tier === 'secondary')
    expect(grouped.map((p) => p.id).sort()).toEqual(secondary.map((p) => p.id).sort())
  })

  it('exposes a lookup for every id', () => {
    for (const id of ALL_PANEL_IDS) {
      expect(getPanel(id)?.id).toBe(id)
    }
  })

  it('every panel has an icon, keywords, and a description', () => {
    for (const panel of DEVTOOLS_PANELS) {
      expect(panel.icon).toBeTruthy()
      expect(panel.description.length).toBeGreaterThan(0)
      expect(Array.isArray(panel.keywords)).toBe(true)
    }
  })

  describe('migratePanelId', () => {
    it('migrates the old nodes id to data', () => {
      expect(migratePanelId('nodes')).toBe('data')
    })
    it('passes through a valid id', () => {
      expect(migratePanelId('performance')).toBe('performance')
    })
    it('returns null for an unknown id', () => {
      expect(migratePanelId('not-a-panel')).toBeNull()
    })
  })
})
