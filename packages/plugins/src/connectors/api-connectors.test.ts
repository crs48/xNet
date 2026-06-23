import { describe, expect, it } from 'vitest'
import {
  buildAirtableConnector,
  buildGithubConnector,
  buildLinearConnector,
  buildNotionConnector,
  EXTERNAL_ITEM_SCHEMA
} from './api-connectors'
import { ConnectorSyncError, runConnectorSync } from './sync-runner'

interface Created {
  schemaId: string
  properties: Record<string, unknown>
}

/** A capturing fetch + store harness for connector pulls. */
function harness(responseByUrl: (url: string) => unknown) {
  const created: Created[] = []
  const requests: Array<{ url: string; init: unknown }> = []
  const fetch = async (input: string | { url: string }, init?: unknown) => {
    const url = typeof input === 'string' ? input : input.url
    requests.push({ url, init })
    return responseByUrl(url)
  }
  const store = {
    async create({ schemaId, properties }: Created) {
      created.push({ schemaId, properties })
      return { id: `id-${created.length}`, schemaId }
    },
    async get() {
      return null
    },
    async update() {
      return undefined
    }
  }
  return { created, requests, fetch, store }
}

/** A harness that returns a different response on each successive fetch call. */
function sequenceHarness(responses: unknown[]) {
  let i = 0
  return harness(() => responses[Math.min(i++, responses.length - 1)])
}

describe('buildGithubConnector', () => {
  it('imports issues + PRs as ExternalItem nodes and sends the token', async () => {
    const h = harness(() => [
      { number: 1, title: 'An issue', html_url: 'https://gh/1', state: 'open', body: 'b' },
      { number: 2, title: 'A PR', html_url: 'https://gh/2', state: 'closed', pull_request: {} }
    ])
    const connector = buildGithubConnector({ owner: 'octo', repo: 'repo' })
    const result = await runConnectorSync(connector.definition, {
      env: { GITHUB_TOKEN: 'ghtok' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })
    expect(result.written).toBe(2)
    expect(h.created[0].properties).toMatchObject({
      source: 'github',
      kind: 'issue',
      externalId: 'octo/repo#1',
      title: 'An issue',
      url: 'https://gh/1',
      status: 'open',
      space: 'space-1'
    })
    expect(h.created[1].properties).toMatchObject({
      kind: 'pull_request',
      externalId: 'octo/repo#2'
    })
    const headers = (h.requests[0].init as { headers: Record<string, string> }).headers
    expect(headers.Authorization).toBe('Bearer ghtok')
  })

  it('throws a loud error when the required secret is missing', async () => {
    const h = harness(() => [])
    await expect(
      runConnectorSync(buildGithubConnector({ owner: 'o', repo: 'r' }).definition, {
        env: {},
        fetch: h.fetch,
        store: h.store,
        space: 'space-1'
      })
    ).rejects.toThrow(ConnectorSyncError)
  })

  it('throws on a non-2xx response instead of silently writing nothing', async () => {
    const h = harness(() => ({ ok: false, status: 404, json: async () => ({}) }))
    await expect(
      runConnectorSync(buildGithubConnector({ owner: 'o', repo: 'r' }).definition, {
        env: { GITHUB_TOKEN: 't' },
        fetch: h.fetch,
        store: h.store,
        space: 'space-1'
      })
    ).rejects.toThrow(ConnectorSyncError)
  })

  it('follows pagination across pages', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      title: `#${i + 1}`,
      state: 'open'
    }))
    const lastPage = [{ number: 101, title: '#101', state: 'open' }]
    const h = sequenceHarness([fullPage, lastPage])
    const result = await runConnectorSync(
      buildGithubConnector({ owner: 'o', repo: 'r' }).definition,
      {
        env: { GITHUB_TOKEN: 't' },
        fetch: h.fetch,
        store: h.store,
        space: 'space-1'
      }
    )
    expect(result.written).toBe(101)
    expect(h.requests).toHaveLength(2) // page 1 full → fetch page 2 → short → stop
  })
})

describe('buildNotionConnector', () => {
  it('imports pages with a best-effort title', async () => {
    const h = harness(() => ({
      results: [
        {
          id: 'page-1',
          url: 'https://notion.so/page-1',
          last_edited_time: '2024-01-02T03:04:05Z',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'My ' }, { plain_text: 'Page' }] }
          }
        }
      ]
    }))
    const connector = buildNotionConnector()
    const result = await runConnectorSync(connector.definition, {
      env: { NOTION_TOKEN: 'ntok' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })
    expect(result.written).toBe(1)
    expect(h.created[0].properties).toMatchObject({
      source: 'notion',
      kind: 'page',
      externalId: 'page-1',
      title: 'My Page'
    })
    // POST to /v1/search with the Notion-Version header
    const init = h.requests[0].init as { method: string; headers: Record<string, string> }
    expect(init.method).toBe('POST')
    expect(init.headers['Notion-Version']).toBeTruthy()
  })

  it('follows the has_more / next_cursor pagination', async () => {
    const h = sequenceHarness([
      { results: [{ id: 'p1', properties: {} }], has_more: true, next_cursor: 'cur2' },
      { results: [{ id: 'p2', properties: {} }], has_more: false, next_cursor: null }
    ])
    const result = await runConnectorSync(buildNotionConnector().definition, {
      env: { NOTION_TOKEN: 't' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })
    expect(result.written).toBe(2)
    expect(h.requests).toHaveLength(2)
    // second request carries the cursor
    expect((h.requests[1].init as { body: string }).body).toContain('cur2')
  })
})

describe('buildLinearConnector', () => {
  it('imports issues via GraphQL with the API key sent verbatim (no Bearer)', async () => {
    const h = harness(() => ({
      data: {
        issues: {
          nodes: [
            {
              id: 'uuid-1',
              identifier: 'XN-12',
              title: 'Fix the grid',
              url: 'https://linear.app/x/issue/XN-12',
              description: 'desc',
              updatedAt: '2024-05-06T07:08:09Z',
              state: { name: 'In Progress' }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      }
    }))
    const result = await runConnectorSync(buildLinearConnector().definition, {
      env: { LINEAR_API_KEY: 'lin_api_abc' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })
    expect(result.written).toBe(1)
    expect(h.created[0].properties).toMatchObject({
      source: 'linear',
      kind: 'issue',
      externalId: 'XN-12',
      title: 'Fix the grid',
      url: 'https://linear.app/x/issue/XN-12',
      status: 'In Progress',
      space: 'space-1'
    })
    const init = h.requests[0].init as { method: string; headers: Record<string, string> }
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('lin_api_abc') // no "Bearer " prefix
  })

  it('throws when LINEAR_API_KEY is missing', async () => {
    const h = harness(() => ({ data: { issues: { nodes: [] } } }))
    await expect(
      runConnectorSync(buildLinearConnector().definition, {
        env: {},
        fetch: h.fetch,
        store: h.store,
        space: 'space-1'
      })
    ).rejects.toThrow(ConnectorSyncError)
  })

  it('follows the GraphQL pageInfo cursor', async () => {
    const h = sequenceHarness([
      {
        data: {
          issues: {
            nodes: [{ identifier: 'XN-1', title: 'one' }],
            pageInfo: { hasNextPage: true, endCursor: 'cur-2' }
          }
        }
      },
      {
        data: {
          issues: {
            nodes: [{ identifier: 'XN-2', title: 'two' }],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    ])
    const result = await runConnectorSync(buildLinearConnector().definition, {
      env: { LINEAR_API_KEY: 'k' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })
    expect(result.written).toBe(2)
    expect((h.requests[1].init as { body: string }).body).toContain('cur-2')
  })
})

describe('buildAirtableConnector', () => {
  it('imports records, titling from the first string field and keeping raw', async () => {
    const h = harness(() => ({
      records: [{ id: 'rec1', fields: { Name: 'Acme', Count: 3 } }]
    }))
    const connector = buildAirtableConnector({ baseId: 'appX', tableId: 'Table 1' })
    const result = await runConnectorSync(connector.definition, {
      env: { AIRTABLE_TOKEN: 'atok' },
      fetch: h.fetch,
      store: h.store,
      space: 'space-1'
    })
    expect(result.written).toBe(1)
    expect(h.created[0].schemaId).toBe(EXTERNAL_ITEM_SCHEMA)
    expect(h.created[0].properties).toMatchObject({
      source: 'airtable',
      kind: 'record',
      externalId: 'rec1',
      title: 'Acme',
      raw: { Name: 'Acme', Count: 3 }
    })
    // table name is URL-encoded into the path
    expect(h.requests[0].url).toContain('Table%201')
  })
})
