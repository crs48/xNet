import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createNodeStoreProxy,
  createSchemaRegistryProxy,
  sendStoreRequest,
  setupStoreResponseHandler
} from './renderer-store-proxy'

/**
 * A stand-in renderer. `windows` is mutated per test to model the window not
 * existing yet — the state both subsystems actually start in, since they run
 * before `createWindow()`.
 */
const windows: Array<{ webContents: { send: (channel: string, payload: StoreRequest) => void } }> =
  []

interface StoreRequest {
  id: number
  operation: string
  params: Record<string, unknown>
}

/**
 * The `xnet:localapi:store-response` listeners captured from `ipcMain.on`.
 * Registration is idempotent and module-scoped, so this is filled exactly once
 * and must not be reset between tests.
 */
const respond: ((
  _: unknown,
  response: { id: number; result?: unknown; error?: string }
) => void)[] = []

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/user-data') },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn((channel: string, listener: never) => {
      if (channel === 'xnet:localapi:store-response') respond.push(listener)
    })
  },
  BrowserWindow: { getAllWindows: () => windows }
}))

/** Attach a window that answers every request with `reply(operation)`. */
function attachWindow(reply: (operation: string) => unknown): void {
  windows.push({
    webContents: {
      send: (_channel, request) => {
        // Answer on a later tick, as real IPC would.
        queueMicrotask(() => {
          for (const listener of respond) {
            listener(null, { id: request.id, result: reply(request.operation) })
          }
        })
      }
    }
  })
}

setupStoreResponseHandler()

beforeEach(() => {
  windows.length = 0
})

describe('sendStoreRequest', () => {
  it('rejects when there is no window rather than resolving to a placeholder', async () => {
    await expect(sendStoreRequest('list', {})).rejects.toThrow('No window available')
  })
})

describe('createSchemaRegistryProxy', () => {
  it('throws from getAllIRIs before priming, so "not ready" never reads as "no schemas"', () => {
    const schemas = createSchemaRegistryProxy()
    expect(() => schemas.getAllIRIs()).toThrow(/not primed/)
  })

  it('serves the renderer IRI list once primed', async () => {
    attachWindow(() => ['xnet://xnet.fyi/Page@1.0.0', 'xnet://xnet.fyi/Task@1.0.0'])
    const schemas = createSchemaRegistryProxy()

    await schemas.ensurePrimed()

    expect(schemas.getAllIRIs()).toEqual([
      'xnet://xnet.fyi/Page@1.0.0',
      'xnet://xnet.fyi/Task@1.0.0'
    ])
  })

  it('keeps retrying until the window exists, since priming starts before createWindow()', async () => {
    const schemas = createSchemaRegistryProxy()
    const primed = schemas.ensurePrimed()

    // No window yet: the first attempt fails and the loop backs off.
    expect(() => schemas.getAllIRIs()).toThrow(/not primed/)
    attachWindow(() => ['xnet://xnet.fyi/Page@1.0.0'])

    await primed
    expect(schemas.getAllIRIs()).toEqual(['xnet://xnet.fyi/Page@1.0.0'])
  })

  it('single-flights priming so concurrent callers share one round trip', async () => {
    let calls = 0
    attachWindow(() => {
      calls += 1
      return []
    })
    const schemas = createSchemaRegistryProxy()

    await Promise.all([schemas.ensurePrimed(), schemas.ensurePrimed(), schemas.ensurePrimed()])

    expect(calls).toBe(1)
  })

  it('proxies get() to the renderer', async () => {
    attachWindow((operation) =>
      operation === 'schemas.get' ? { iri: 'xnet://xnet.fyi/Page@1.0.0', name: 'Page' } : null
    )
    const schemas = createSchemaRegistryProxy()

    await expect(schemas.get('xnet://xnet.fyi/Page@1.0.0')).resolves.toEqual({
      iri: 'xnet://xnet.fyi/Page@1.0.0',
      name: 'Page'
    })
  })
})

/**
 * The bridged agent's lane had the weakest retrieval of the three: the proxy
 * carried no `searchText`, so the AI surface fell back to `list({ limit: 500 })`
 * + substring match — 500 nodes over IPC per search, and a result the agent
 * could not tell from an exhaustive one (exploration 0415).
 */
describe('createNodeStoreProxy searchText', () => {
  it('asks the renderer, which is the process that owns nodes_fts', async () => {
    const seen: StoreRequest[] = []
    windows.push({
      webContents: {
        send: (_channel, request) => {
          seen.push(request)
          queueMicrotask(() => {
            for (const listener of respond) {
              listener(null, {
                id: request.id,
                result:
                  request.operation === 'searchText' ? [{ nodeId: 'page_1', rank: -3.2 }] : null
              })
            }
          })
        }
      }
    })

    const store = createNodeStoreProxy()
    await expect(store.searchText?.('cutover', 20, { schemaId: 'S' })).resolves.toEqual([
      { nodeId: 'page_1', rank: -3.2 }
    ])
    expect(seen[0]).toMatchObject({
      operation: 'searchText',
      params: { query: 'cutover', limit: 20, schemaId: 'S' }
    })
  })

  it('passes a renderer `null` straight through, so "no index" stays distinguishable', async () => {
    // `null` means the storage has no FTS. Coercing it to `[]` here would make
    // "I cannot search" read as "nothing matched".
    attachWindow(() => null)
    const store = createNodeStoreProxy()
    await expect(store.searchText?.('cutover', 20)).resolves.toBeNull()
  })
})
