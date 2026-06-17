/**
 * Tests for connector interop artifacts (exploration 0196): the portability
 * emitter, marketplace entry, importer bridge, AI-install gate, and CLI wrap.
 */

import type { ConnectorDefinition } from '../connectors/define-connector'
import { describe, it, expect, vi } from 'vitest'
import {
  CONNECTOR_CATEGORY,
  connectorAsImporter,
  connectorMarketplaceEntry,
  defineConnector,
  emitConnectorArtifacts,
  evaluateConnectorInstall,
  runConnectorSync,
  wrapCliConnector
} from '../connectors'
import { filterByCategory } from '../ecosystem/marketplace'

const SLACK_MESSAGE = 'xnet://dev.xnet/SlackMessage@1.0.0'

function slackConnector() {
  const def: ConnectorDefinition = {
    id: 'dev.xnet.connector.slack',
    name: 'Slack',
    author: 'acme',
    description: 'Sync Slack mentions',
    capabilities: {
      secrets: ['SLACK_BOT_TOKEN'],
      schemaWrite: [SLACK_MESSAGE],
      network: ['slack.com']
    },
    sync: { schemas: [SLACK_MESSAGE], pull: async () => ({ written: 0 }) },
    agentTools: [
      {
        id: 'dev.xnet.connector.slack.search',
        name: 'slack_search',
        description: 'Search mentions',
        invoke: () => []
      }
    ]
  }
  return defineConnector(def)
}

describe('connector marketplace + artifacts', () => {
  it('emits a connectors-category marketplace entry filterable by category', () => {
    const entry = connectorMarketplaceEntry(slackConnector())
    expect(entry.category).toBe(CONNECTOR_CATEGORY)
    expect(entry.id).toBe('dev.xnet.connector.slack')
    expect(entry.capabilities?.schemaWrite).toEqual([SLACK_MESSAGE])
    expect(filterByCategory([entry], 'connectors')).toHaveLength(1)
    expect(filterByCategory([entry], 'finance')).toHaveLength(0)
  })

  it('emits tool descriptors + a SKILL.md fragment naming the tools', () => {
    const artifacts = emitConnectorArtifacts(slackConnector())
    expect(artifacts.agentTools).toEqual([
      { name: 'slack_search', description: 'Search mentions', risk: 'medium' }
    ])
    expect(artifacts.skillMarkdown).toContain('Slack connector')
    expect(artifacts.skillMarkdown).toContain('`slack_search`')
    expect(artifacts.marketplaceEntry.category).toBe(CONNECTOR_CATEGORY)
  })

  it('exposes the connector as an importer adapter (0189 generalization)', () => {
    const importer = connectorAsImporter(slackConnector())
    expect(importer.id).toBe('dev.xnet.connector.slack.import')
    expect(importer.platform).toBe('slack')
    expect((importer.adapter as { connectorId: string }).connectorId).toBe(
      'dev.xnet.connector.slack'
    )
  })
})

describe('evaluateConnectorInstall — AI trust gate', () => {
  const caps = {
    secrets: ['SLACK_BOT_TOKEN'],
    schemaWrite: [SLACK_MESSAGE],
    network: ['slack.com']
  }

  it('blocks an AI-generated connector that requests secrets (manual promotion)', () => {
    const gate = evaluateConnectorInstall('ai-generated', caps)
    expect(gate.installable).toBe(false)
    expect(gate.blockedReason).toMatch(/promote it/i)
  })

  it('allows an AI-generated connector with no secrets', () => {
    const gate = evaluateConnectorInstall('ai-generated', {
      schemaWrite: [SLACK_MESSAGE],
      network: ['slack.com']
    })
    expect(gate.installable).toBe(true)
  })

  it('allows a marketplace/authored connector to request secrets', () => {
    expect(evaluateConnectorInstall('marketplace', caps).installable).toBe(true)
    expect(evaluateConnectorInstall('authored', caps).installable).toBe(true)
  })
})

describe('wrapCliConnector', () => {
  it('runs the CLI and maps parsed records into space-stamped nodes', async () => {
    const runCli = vi.fn().mockResolvedValue('a\nb\nc')
    const connector = wrapCliConnector({
      id: 'dev.acme.connector.lines',
      name: 'Lines CLI',
      schema: 'xnet://dev.acme/Line@1.0.0',
      network: ['example.com'],
      runCli,
      parse: (stdout) => stdout.split('\n').map((text) => ({ text }))
    })

    const created: Array<Record<string, unknown>> = []
    const result = await runConnectorSync(connector.definition, {
      env: {},
      fetch: vi.fn(),
      store: {
        create: async ({ schemaId, properties }) => {
          created.push(properties)
          return { id: `n${created.length}`, schemaId }
        },
        get: async () => null,
        update: async () => ({})
      },
      space: 'space-A'
    })

    expect(runCli).toHaveBeenCalledOnce()
    expect(result.written).toBe(3)
    expect(created.map((p) => p.text)).toEqual(['a', 'b', 'c'])
    expect(created.every((p) => p.space === 'space-A')).toBe(true)
  })
})
