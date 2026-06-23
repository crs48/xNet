/**
 * @xnetjs/plugins — API pull connectors: GitHub, Notion, Airtable
 * (exploration 0213).
 *
 * The API-key tier of the integration catalog. Each polls a service's REST API
 * and materializes objects into the generic, governed `ExternalItem` node
 * (source / kind / externalId / title / url / status / raw), through the guarded
 * connector store — the credential stays in the hub broker; the agent only ever
 * sees the synced nodes. Schema IRIs are inlined (matching `slack-migration`) so
 * the package keeps no `@xnetjs/data` dependency.
 *
 * Robustness (0213 review): each pull (1) requires its declared secret to be
 * present (a misconfiguration is a loud error, not a silent `Bearer ` request),
 * (2) throws on a non-2xx response instead of returning `{ written: 0 }`, and
 * (3) follows the provider's pagination so it doesn't silently cap at one page.
 */

import type { AgentToolContribution } from '../agent-tools'
import type { ConnectorFetch, DefinedConnector } from './define-connector'
import { ConnectorSyncError } from './sync-runner'
import { defineConnector } from './define-connector'

export const EXTERNAL_ITEM_SCHEMA = 'xnet://xnet.fyi/ExternalItem@1.0.0'

/** Hard ceiling on pages fetched per sync, so a bad cursor can't loop forever. */
const MAX_PAGES = 20

/** Read a value that may be a `fetch` Response or an already-parsed object. */
async function asJson<T>(value: unknown): Promise<T> {
  if (value && typeof (value as { json?: unknown }).json === 'function') {
    return (await (value as { json: () => Promise<T> }).json()) as T
  }
  return value as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Require a declared secret to be present; throw a loud error otherwise. */
function requireSecret(env: Record<string, string | undefined>, key: string, id: string): string {
  const value = env[key]
  if (!value) throw new ConnectorSyncError(`connector '${id}' is missing required secret ${key}`)
  return value
}

/**
 * Issue a request through the guarded fetch and parse JSON, throwing on a
 * non-2xx response. (Real `fetch` returns a `Response` with `ok`/`status`; test
 * fakes return a plain value with neither, so the status check is skipped there.)
 */
async function fetchJson<T>(
  fetch: ConnectorFetch,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<T> {
  const res =
    body === undefined
      ? await fetch(url, { headers })
      : await fetch(url, { method: 'POST', headers, body })
  if (isRecord(res) && 'ok' in res && res.ok === false) {
    const status = isRecord(res) && typeof res.status === 'number' ? res.status : 'error'
    throw new ConnectorSyncError(`request to ${new URL(url).host} failed (${status})`)
  }
  return asJson<T>(res)
}

function searchTool(
  id: string,
  name: string,
  description: string,
  search: (args: { query: string }) => unknown | Promise<unknown>
): AgentToolContribution {
  return {
    id: `${id}.search`,
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Full-text query.' } },
      required: ['query']
    },
    invoke: (args) => search({ query: String(args.query ?? '') })
  }
}

interface ApiConnectorBaseOptions {
  id?: string
  search?: (args: { query: string }) => unknown | Promise<unknown>
}

function parseDate(value: unknown): number | undefined {
  const s = str(value)
  if (!s) return undefined
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : undefined
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

export const GITHUB_CONNECTOR_ID = 'dev.xnet.connector.github'

interface GithubIssue {
  number?: number
  title?: string
  html_url?: string
  body?: string
  state?: string
  updated_at?: string
  pull_request?: unknown
}

export interface GithubConnectorOptions extends ApiConnectorBaseOptions {
  /** Repository owner (user or org). */
  owner: string
  /** Repository name. */
  repo: string
}

/**
 * Build the GitHub connector. Imports a repo's issues and pull requests
 * (`state=all`, all pages) into `ExternalItem` nodes via the GitHub REST API
 * (`GITHUB_TOKEN`).
 */
export function buildGithubConnector(options: GithubConnectorOptions): DefinedConnector {
  const id = options.id ?? GITHUB_CONNECTOR_ID
  const { owner, repo } = options
  const tools = options.search
    ? [
        searchTool(
          id,
          'github_search_items',
          'Search imported GitHub issues and PRs.',
          options.search
        )
      ]
    : []
  return defineConnector({
    id,
    name: 'GitHub',
    description: 'Import GitHub issues and pull requests into xNet.',
    capabilities: {
      secrets: ['GITHUB_TOKEN'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.github.com']
    },
    sync: {
      schemas: [EXTERNAL_ITEM_SCHEMA],
      cadence: 'hourly',
      async pull(ctx) {
        const token = requireSecret(ctx.env, 'GITHUB_TOKEN', id)
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'xnet-connector'
        }
        let written = 0
        for (let page = 1; page <= MAX_PAGES; page++) {
          const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`
          const issues = await fetchJson<GithubIssue[]>(ctx.fetch, url, headers)
          const list = Array.isArray(issues) ? issues : []
          for (const issue of list) {
            const title = str(issue.title)
            if (issue.number === undefined || !title) continue
            await ctx.store.create({
              schemaId: EXTERNAL_ITEM_SCHEMA,
              properties: {
                source: 'github',
                kind: issue.pull_request ? 'pull_request' : 'issue',
                externalId: `${owner}/${repo}#${issue.number}`,
                title,
                ...(str(issue.html_url) ? { url: str(issue.html_url) } : {}),
                ...(str(issue.body) ? { body: str(issue.body) } : {}),
                ...(str(issue.state) ? { status: str(issue.state) } : {}),
                ...(parseDate(issue.updated_at) ? { updatedAt: parseDate(issue.updated_at) } : {})
              }
            })
            written++
          }
          if (list.length < 100) break // last page
        }
        return { written }
      }
    },
    agentTools: tools
  })
}

// ─── Notion ──────────────────────────────────────────────────────────────────

export const NOTION_CONNECTOR_ID = 'dev.xnet.connector.notion'

export type NotionConnectorOptions = ApiConnectorBaseOptions

/**
 * Build the Notion connector. Imports pages the integration token can see (via
 * `/v1/search`, following `has_more`) into `ExternalItem` nodes (`NOTION_TOKEN`).
 */
export function buildNotionConnector(options: NotionConnectorOptions = {}): DefinedConnector {
  const id = options.id ?? NOTION_CONNECTOR_ID
  const tools = options.search
    ? [searchTool(id, 'notion_search_pages', 'Search imported Notion pages.', options.search)]
    : []
  return defineConnector({
    id,
    name: 'Notion',
    description: 'Import Notion pages into xNet.',
    capabilities: {
      secrets: ['NOTION_TOKEN'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.notion.com']
    },
    sync: {
      schemas: [EXTERNAL_ITEM_SCHEMA],
      cadence: 'hourly',
      async pull(ctx) {
        const token = requireSecret(ctx.env, 'NOTION_TOKEN', id)
        const headers = {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'content-type': 'application/json'
        }
        let written = 0
        let cursor: string | undefined
        for (let page = 0; page < MAX_PAGES; page++) {
          const body = await fetchJson<{
            results?: unknown[]
            has_more?: boolean
            next_cursor?: string | null
          }>(
            ctx.fetch,
            'https://api.notion.com/v1/search',
            headers,
            JSON.stringify({
              filter: { value: 'page', property: 'object' },
              page_size: 100,
              ...(cursor ? { start_cursor: cursor } : {})
            })
          )
          for (const node of body.results ?? []) {
            if (!isRecord(node)) continue
            const pageId = str(node.id)
            if (!pageId) continue
            await ctx.store.create({
              schemaId: EXTERNAL_ITEM_SCHEMA,
              properties: {
                source: 'notion',
                kind: 'page',
                externalId: pageId,
                title: notionTitle(node) ?? 'Untitled',
                ...(str(node.url) ? { url: str(node.url) } : {}),
                ...(parseDate(node.last_edited_time)
                  ? { updatedAt: parseDate(node.last_edited_time) }
                  : {})
              }
            })
            written++
          }
          if (!body.has_more || !body.next_cursor) break
          cursor = body.next_cursor
        }
        return { written }
      }
    },
    agentTools: tools
  })
}

/** Best-effort title from a Notion page's `properties` (the `title` type prop). */
function notionTitle(page: Record<string, unknown>): string | undefined {
  const props = isRecord(page.properties) ? page.properties : {}
  for (const value of Object.values(props)) {
    if (isRecord(value) && value.type === 'title' && Array.isArray(value.title)) {
      const text = value.title
        .map((t) => (isRecord(t) ? str(t.plain_text) : undefined))
        .filter(Boolean)
        .join('')
      if (text) return text
    }
  }
  return undefined
}

// ─── Airtable ────────────────────────────────────────────────────────────────

export const AIRTABLE_CONNECTOR_ID = 'dev.xnet.connector.airtable'

export interface AirtableConnectorOptions extends ApiConnectorBaseOptions {
  /** The Airtable base id (`app...`). */
  baseId: string
  /** The table id or name. */
  tableId: string
}

/**
 * Build the Airtable connector. Imports a table's records (following the
 * `offset` cursor) into `ExternalItem` nodes, preserving each record's fields in
 * `raw` (`AIRTABLE_TOKEN`).
 */
export function buildAirtableConnector(options: AirtableConnectorOptions): DefinedConnector {
  const id = options.id ?? AIRTABLE_CONNECTOR_ID
  const { baseId, tableId } = options
  const tools = options.search
    ? [
        searchTool(
          id,
          'airtable_search_records',
          'Search imported Airtable records.',
          options.search
        )
      ]
    : []
  return defineConnector({
    id,
    name: 'Airtable',
    description: 'Import Airtable records into xNet.',
    capabilities: {
      secrets: ['AIRTABLE_TOKEN'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.airtable.com']
    },
    sync: {
      schemas: [EXTERNAL_ITEM_SCHEMA],
      cadence: 'hourly',
      async pull(ctx) {
        const token = requireSecret(ctx.env, 'AIRTABLE_TOKEN', id)
        const base = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`
        let written = 0
        let offset: string | undefined
        for (let page = 0; page < MAX_PAGES; page++) {
          const url = offset ? `${base}?offset=${encodeURIComponent(offset)}` : base
          const body = await fetchJson<{ records?: unknown[]; offset?: string }>(ctx.fetch, url, {
            Authorization: `Bearer ${token}`
          })
          for (const record of body.records ?? []) {
            if (!isRecord(record)) continue
            const recordId = str(record.id)
            if (!recordId) continue
            const fields = isRecord(record.fields) ? record.fields : {}
            await ctx.store.create({
              schemaId: EXTERNAL_ITEM_SCHEMA,
              properties: {
                source: 'airtable',
                kind: 'record',
                externalId: recordId,
                title: firstStringField(fields) ?? recordId,
                raw: fields
              }
            })
            written++
          }
          if (!body.offset) break
          offset = body.offset
        }
        return { written }
      }
    },
    agentTools: tools
  })
}

function firstStringField(fields: Record<string, unknown>): string | undefined {
  for (const value of Object.values(fields)) {
    const s = str(value)
    if (s) return s
  }
  return undefined
}

// ─── Linear ──────────────────────────────────────────────────────────────────

export const LINEAR_CONNECTOR_ID = 'dev.xnet.connector.linear'

const LINEAR_ISSUES_QUERY = `query($after: String) {
  issues(first: 100, after: $after) {
    nodes { id identifier title url description updatedAt state { name } }
    pageInfo { hasNextPage endCursor }
  }
}`

interface LinearIssue {
  identifier?: string
  title?: string
  url?: string
  description?: string
  updatedAt?: string
  state?: { name?: string }
}

export type LinearConnectorOptions = ApiConnectorBaseOptions

/**
 * Build the Linear connector. Imports issues via Linear's GraphQL API (following
 * the `pageInfo` cursor) into `ExternalItem` nodes (`LINEAR_API_KEY`). Personal
 * API keys go in the `Authorization` header verbatim (no `Bearer` prefix).
 */
export function buildLinearConnector(options: LinearConnectorOptions = {}): DefinedConnector {
  const id = options.id ?? LINEAR_CONNECTOR_ID
  const tools = options.search
    ? [searchTool(id, 'linear_search_issues', 'Search imported Linear issues.', options.search)]
    : []
  return defineConnector({
    id,
    name: 'Linear',
    description: 'Import Linear issues into xNet.',
    capabilities: {
      secrets: ['LINEAR_API_KEY'],
      schemaWrite: [EXTERNAL_ITEM_SCHEMA],
      network: ['api.linear.app']
    },
    sync: {
      schemas: [EXTERNAL_ITEM_SCHEMA],
      cadence: 'hourly',
      async pull(ctx) {
        const key = requireSecret(ctx.env, 'LINEAR_API_KEY', id)
        const headers = { Authorization: key, 'content-type': 'application/json' }
        let written = 0
        let cursor: string | undefined
        for (let page = 0; page < MAX_PAGES; page++) {
          const body = await fetchJson<{
            data?: {
              issues?: {
                nodes?: LinearIssue[]
                pageInfo?: { hasNextPage?: boolean; endCursor?: string }
              }
            }
          }>(
            ctx.fetch,
            'https://api.linear.app/graphql',
            headers,
            JSON.stringify({ query: LINEAR_ISSUES_QUERY, variables: { after: cursor ?? null } })
          )
          const issues = body.data?.issues
          for (const issue of issues?.nodes ?? []) {
            const identifier = str(issue.identifier)
            const title = str(issue.title)
            if (!identifier || !title) continue
            await ctx.store.create({
              schemaId: EXTERNAL_ITEM_SCHEMA,
              properties: {
                source: 'linear',
                kind: 'issue',
                externalId: identifier,
                title,
                ...(str(issue.url) ? { url: str(issue.url) } : {}),
                ...(str(issue.description) ? { body: str(issue.description) } : {}),
                ...(str(issue.state?.name) ? { status: str(issue.state?.name) } : {}),
                ...(parseDate(issue.updatedAt) ? { updatedAt: parseDate(issue.updatedAt) } : {})
              }
            })
            written++
          }
          if (!issues?.pageInfo?.hasNextPage || !issues.pageInfo.endCursor) break
          cursor = issues.pageInfo.endCursor
        }
        return { written }
      }
    },
    agentTools: tools
  })
}
