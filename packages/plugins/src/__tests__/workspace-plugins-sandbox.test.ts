/**
 * Workspace-plugin sandbox boundary tests (0331 — increment 1c + the
 * capability-floor / denylist / no-host-realm validation items).
 */

import { describe, expect, it } from 'vitest'
import {
  PLUGIN_FRAME_SANDBOX,
  buildPluginFrameSrcdoc,
  frameConnectSrc,
  framePluginCsp
} from '../workspace-plugins/frame'
import {
  PLUGIN_STORE_DENYLIST,
  PluginStoreRpcError,
  createPluginStoreRpc,
  isDenylistedSchema,
  type WorkspacePluginStore
} from '../workspace-plugins/store-rpc'

const TASK = 'xnet://xnet.fyi/Task@1.0.0'

function memoryStore(): WorkspacePluginStore & { nodes: Map<string, { schemaId: string }> } {
  const nodes = new Map<
    string,
    { id: string; schemaId: string; properties: Record<string, unknown> }
  >()
  let n = 0
  return {
    nodes: nodes as never,
    list: async ({ schemaId }) =>
      [...nodes.values()].filter((node) => !schemaId || node.schemaId === schemaId),
    get: async (id) => nodes.get(id) ?? null,
    create: async ({ schemaId, properties }) => {
      const id = `node-${++n}`
      nodes.set(id, { id, schemaId, properties })
      return { id }
    },
    update: async (id, properties) => {
      const node = nodes.get(id)
      if (node) node.properties = { ...node.properties, ...properties }
    },
    delete: async (id) => {
      nodes.delete(id)
    }
  }
}

describe('sandbox frame document (1c)', () => {
  it('never grants allow-same-origin', () => {
    expect(PLUGIN_FRAME_SANDBOX).toBe('allow-scripts')
    expect(PLUGIN_FRAME_SANDBOX).not.toContain('allow-same-origin')
  })

  it('defaults connect-src to none — no egress without a declared allowlist', () => {
    expect(frameConnectSrc(undefined)).toBe("'none'")
    expect(frameConnectSrc({ capabilities: { network: true } })).toBe("'none'")
  })

  it('derives connect-src from the manifest network allowlist', () => {
    const csp = framePluginCsp({ capabilities: { network: ['api.example.com'] } })
    expect(csp).toContain('connect-src https://api.example.com')
    // Host-injection through a hostile "host" string must not widen the CSP.
    expect(frameConnectSrc({ capabilities: { network: ["evil.com' *; script-src *"] } })).toBe(
      "'none'"
    )
  })

  it('builds a srcdoc whose CSP only allows inline + blob scripts (no remote code)', () => {
    const srcdoc = buildPluginFrameSrcdoc(undefined)
    expect(srcdoc).toContain("default-src 'none'")
    expect(srcdoc).toContain("script-src 'unsafe-inline' blob:")
    expect(srcdoc).toContain("connect-src 'none'")
    expect(srcdoc).not.toContain('allow-same-origin')
    // The host realm never import()s plugin code: the loader lives in the frame.
    expect(srcdoc).toContain('URL.createObjectURL')
  })
})

describe('store RPC — capability floor + denylist (validation items)', () => {
  it('denies writes without a schemaWrite grant (closed by default)', async () => {
    const rpc = createPluginStoreRpc({
      store: memoryStore(),
      pluginId: 'com.example.readonly',
      permissions: { schemas: { read: [TASK] as never } }
    })
    await expect(rpc.call('create', { schemaId: TASK, properties: {} })).rejects.toThrow(
      /schemaWrite/
    )
  })

  it('denies reads without a read grant', async () => {
    const rpc = createPluginStoreRpc({ store: memoryStore(), pluginId: 'com.example.none' })
    await expect(rpc.call('query', { schemaId: TASK })).rejects.toThrow(/read permission/)
  })

  it('allows granted reads and writes, and re-checks writes by node schema', async () => {
    const store = memoryStore()
    const rpc = createPluginStoreRpc({
      store,
      pluginId: 'com.example.tasks',
      permissions: { schemas: { read: [TASK] as never, write: [TASK] as never } }
    })
    const created = (await rpc.call('create', {
      schemaId: TASK,
      properties: { title: 'hi' }
    })) as { id: string }
    await rpc.call('update', { id: created.id, properties: { title: 'hello' } })
    const rows = (await rpc.call('query', { schemaId: TASK })) as Array<{ id: string }>
    expect(rows).toHaveLength(1)
    await rpc.call('delete', { id: created.id })
    expect((await rpc.call('query', { schemaId: TASK })) as unknown[]).toHaveLength(0)
  })

  it('denylist wins over ANY grant — identity/plugin-source/membership unreachable', async () => {
    const store = memoryStore()
    const rpc = createPluginStoreRpc({
      store,
      pluginId: 'com.example.greedy',
      permissions: { schemas: { read: '*', write: '*' } }
    })
    for (const iri of [
      'xnet://xnet.fyi/PluginSource@1.0.0',
      'xnet://xnet.fyi/Plugin@1.0.0',
      'xnet://xnet.fyi/Grant@1.0.0',
      'xnet://xnet.fyi/SpaceMembership@1.0.0',
      'xnet://xnet.fyi/Profile@1.0.0',
      'xnet://xnet.fyi/AccountRecord@1.0.0'
    ]) {
      expect(isDenylistedSchema(iri)).toBe(true)
      await expect(rpc.call('query', { schemaId: iri })).rejects.toThrow(PluginStoreRpcError)
      await expect(rpc.call('create', { schemaId: iri, properties: {} })).rejects.toThrow(
        /not accessible/
      )
    }
    // Reading a denylisted node through `get` is refused after resolution too.
    const hidden = await store.create({
      schemaId: 'xnet://xnet.fyi/Profile@1.0.0',
      properties: {}
    })
    await expect(rpc.call('get', { id: hidden.id })).rejects.toThrow(/not accessible/)
  })

  it('covers every denylist pattern with a versioned IRI', () => {
    for (const pattern of PLUGIN_STORE_DENYLIST) {
      const iri = pattern.endsWith('*') ? `${pattern.slice(0, -1)}1.0.0` : pattern
      expect(isDenylistedSchema(iri)).toBe(true)
    }
  })

  it('rejects unknown ops', async () => {
    const rpc = createPluginStoreRpc({ store: memoryStore(), pluginId: 'com.example.x' })
    await expect(rpc.call('subscribe', {})).rejects.toThrow(/Unknown store op/)
  })
})
