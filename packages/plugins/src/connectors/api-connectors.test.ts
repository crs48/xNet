import { describe, expect, it } from 'vitest'
import {
  buildAirtableConnector,
  buildGithubConnector,
  buildNotionConnector,
  EXTERNAL_ITEM_SCHEMA
} from './api-connectors'
import { runConnectorSync } from './sync-runner'

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
