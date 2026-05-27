/**
 * ERP canvas prototype tests.
 */

import { describe, expect, it } from 'vitest'
import {
  createCanvasErpPrototypeRiskSummary,
  createCanvasErpPrototypeScenario,
  getCanvasErpPrototypeAuditEntriesForCard,
  getCanvasErpPrototypeCardsForFrame
} from '../fixtures/erp-prototype'

describe('ERP canvas prototype', () => {
  it('creates a source-backed procurement war room from ERP plugin contributions', () => {
    const scenario = createCanvasErpPrototypeScenario()
    const cardContributions = new Set(
      scenario.pluginManifest.contributes?.canvasCards?.map((contribution) => contribution.id)
    )
    const edgeContributions = new Set(
      scenario.pluginManifest.contributes?.canvasEdges?.map((contribution) => contribution.id)
    )
    const templateContributions = new Set(
      scenario.pluginManifest.contributes?.canvasTemplates?.map((contribution) => contribution.id)
    )

    expect(scenario.pluginManifest.id).toBe('com.xnet.fixtures.erp')
    expect(templateContributions.has(scenario.templateId)).toBe(true)
    expect(scenario.cards).toHaveLength(6)
    expect(scenario.cards.every((card) => card.pluginId === scenario.pluginManifest.id)).toBe(true)
    expect(scenario.cards.every((card) => cardContributions.has(card.contributionId))).toBe(true)
    expect(scenario.edges.every((edge) => edgeContributions.has(edge.contributionId))).toBe(true)
  })

  it('materializes query frames with valid positioned cards', () => {
    const scenario = createCanvasErpPrototypeScenario()
    const inventoryRiskCards = getCanvasErpPrototypeCardsForFrame(
      scenario,
      'erp-prototype-frame-inventory-risk'
    )
    const supplyChainCards = getCanvasErpPrototypeCardsForFrame(
      scenario,
      'erp-prototype-frame-supply-chain'
    )

    expect(inventoryRiskCards.map((card) => card.entityKind)).toEqual([
      'inventory-item',
      'inventory-item',
      'inventory-item'
    ])
    expect(supplyChainCards.map((card) => card.risk)).not.toContain('low')
    expect(
      scenario.cards.every(
        (card) => card.position.width > 0 && card.position.height > 0 && card.sourceNodeId
      )
    ).toBe(true)
  })

  it('summarizes risk and exposes plugin-friendly audit metadata', () => {
    const scenario = createCanvasErpPrototypeScenario()
    const servoAuditEntries = getCanvasErpPrototypeAuditEntriesForCard(
      scenario,
      'erp-prototype-inventory-servo'
    )

    expect(createCanvasErpPrototypeRiskSummary(scenario.cards)).toEqual({
      total: 6,
      low: 1,
      medium: 2,
      high: 3
    })
    expect(scenario.riskSummary.high).toBe(3)
    expect(servoAuditEntries.map((entry) => entry.operation)).toContain('moved')
    expect(scenario.auditEntries.map((entry) => entry.operation)).toEqual(
      expect.arrayContaining(['created', 'moved', 'resized', 'bulk-updated', 'synced'])
    )
  })

  it('declares contextual ERP commands with explicit canvas permissions', () => {
    const scenario = createCanvasErpPrototypeScenario()
    const commandIds = scenario.commands.map((command) => command.id)

    expect(commandIds).toEqual([
      'erp.command.expedite-selected',
      'erp.command.rebalance-inventory',
      'erp.command.open-source-record'
    ])
    expect(
      scenario.commands.every((command) => command.requiredPermissions.includes('canvas.read'))
    ).toBe(true)
    expect(
      scenario.commands.find((command) => command.scope === 'frame')?.requiredPermissions
    ).toContain('canvas.layout')
  })
})
