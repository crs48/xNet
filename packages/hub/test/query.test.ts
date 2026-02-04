import type { HubInstance } from '../src/index'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub } from '../src/index'

describe('Query Engine', () => {
  let hub: HubInstance
  const PORT = 14448

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  const connect = async (): Promise<WebSocket> =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`)
      ws.on('open', () => resolve(ws))
    })

  const sendAndWait = (ws: WebSocket, msg: object, matchType: string): Promise<any> =>
    new Promise((resolve) => {
      const handler = (raw: Buffer) => {
        const data = JSON.parse(raw.toString()) as { type?: string }
        if (data.type === matchType) {
          ws.off('message', handler)
          resolve(data)
        }
      }
      ws.on('message', handler)
      ws.send(JSON.stringify(msg))
    })

  it('indexes a document and searches for it', async () => {
    const ws = await connect()

    const ack = await sendAndWait(
      ws,
      {
        type: 'index-update',
        docId: 'search-doc-1',
        meta: {
          schemaIri: 'xnet://xnet.dev/Page',
          title: 'Quarterly Budget Review'
        },
        text: 'We reviewed the Q4 budget and found significant savings in infrastructure costs.'
      },
      'index-ack'
    )

    expect(ack.indexed).toBe(true)

    const response = await sendAndWait(
      ws,
      {
        type: 'query-request',
        id: 'q-1',
        query: 'budget'
      },
      'query-response'
    )

    expect(response.id).toBe('q-1')
    expect(response.results.length).toBeGreaterThanOrEqual(1)
    expect(response.results[0].docId).toBe('search-doc-1')

    ws.close()
  })

  it('filters by schema IRI', async () => {
    const ws = await connect()

    await sendAndWait(
      ws,
      {
        type: 'index-update',
        docId: 'page-1',
        meta: { schemaIri: 'xnet://xnet.dev/Page', title: 'Design Notes' }
      },
      'index-ack'
    )

    await sendAndWait(
      ws,
      {
        type: 'index-update',
        docId: 'task-1',
        meta: { schemaIri: 'xnet://xnet.dev/Task', title: 'Design Review Task' }
      },
      'index-ack'
    )

    const response = await sendAndWait(
      ws,
      {
        type: 'query-request',
        id: 'q-2',
        query: 'Design',
        filters: { schemaIri: 'xnet://xnet.dev/Task' }
      },
      'query-response'
    )

    expect(response.results.every((r: { schemaIri: string }) => r.schemaIri === 'xnet://xnet.dev/Task')).toBe(
      true
    )

    ws.close()
  })

  it('removes document from index', async () => {
    const ws = await connect()

    await sendAndWait(
      ws,
      {
        type: 'index-update',
        docId: 'remove-me',
        meta: { schemaIri: 'xnet://xnet.dev/Page', title: 'Temporary Document' },
        text: 'Temporary document body should not be searchable after removal.'
      },
      'index-ack'
    )

    const ack = await sendAndWait(
      ws,
      {
        type: 'index-remove',
        docId: 'remove-me'
      },
      'index-ack'
    )

    expect(ack.indexed).toBe(false)

    const response = await sendAndWait(
      ws,
      {
        type: 'query-request',
        id: 'q-3',
        query: 'Temporary'
      },
      'query-response'
    )

    expect(response.results.find((r: { docId: string }) => r.docId === 'remove-me')).toBeUndefined()

    ws.close()
  })

  it('handles empty query gracefully', async () => {
    const ws = await connect()

    const response = await sendAndWait(
      ws,
      {
        type: 'query-request',
        id: 'q-empty',
        query: ''
      },
      'query-response'
    )

    expect(response.results).toEqual([])
    ws.close()
  })

  it('respects pagination', async () => {
    const ws = await connect()

    for (let i = 0; i < 5; i += 1) {
      await sendAndWait(
        ws,
        {
          type: 'index-update',
          docId: `page-${i}`,
          meta: { schemaIri: 'xnet://xnet.dev/Page', title: `Alpha Document ${i}` }
        },
        'index-ack'
      )
    }

    const response = await sendAndWait(
      ws,
      {
        type: 'query-request',
        id: 'q-page',
        query: 'Alpha',
        limit: 2,
        offset: 0
      },
      'query-response'
    )

    expect(response.results.length).toBeLessThanOrEqual(2)

    ws.close()
  })
})
