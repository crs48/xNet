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
 */

import type { AgentToolContribution } from '../agent-tools'
import type { ConnectorFetch, DefinedConnector } from './define-connector'
import { defineConnector } from './define-connector'

export const EXTERNAL_ITEM_SCHEMA = 'xnet://xnet.fyi/ExternalItem@1.0.0'

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
 * (`state=all`) into `ExternalItem` nodes via the GitHub REST API
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
        const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`
        const issues = await asJson<GithubIssue[]>(
          await callApi(ctx.fetch, url, {
            Authorization: `Bearer ${ctx.env.GITHUB_TOKEN ?? ''}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'xnet-connector'
          })
        )
        let written = 0
        for (const issue of Array.isArray(issues) ? issues : []) {
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
 * `/v1/search`) into `ExternalItem` nodes (`NOTION_TOKEN`).
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
        const body = await asJson<{ results?: unknown[] }>(
          await callApi(
            ctx.fetch,
            'https://api.notion.com/v1/search',
            {
              Authorization: `Bearer ${ctx.env.NOTION_TOKEN ?? ''}`,
              'Notion-Version': '2022-06-28',
              'content-type': 'application/json'
            },
            JSON.stringify({ filter: { value: 'page', property: 'object' }, page_size: 100 })
          )
        )
        let written = 0
        for (const page of body.results ?? []) {
          if (!isRecord(page)) continue
          const pageId = str(page.id)
          if (!pageId) continue
          await ctx.store.create({
            schemaId: EXTERNAL_ITEM_SCHEMA,
            properties: {
              source: 'notion',
              kind: 'page',
              externalId: pageId,
              title: notionTitle(page) ?? 'Untitled',
              ...(str(page.url) ? { url: str(page.url) } : {}),
              ...(parseDate(page.last_edited_time)
                ? { updatedAt: parseDate(page.last_edited_time) }
                : {})
            }
          })
          written++
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
 * Build the Airtable connector. Imports a table's records into `ExternalItem`
 * nodes, preserving each record's fields in `raw` (`AIRTABLE_TOKEN`).
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
        const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`
        const body = await asJson<{ records?: unknown[] }>(
          await callApi(ctx.fetch, url, {
            Authorization: `Bearer ${ctx.env.AIRTABLE_TOKEN ?? ''}`
          })
        )
        let written = 0
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

// ─── shared helpers ──────────────────────────────────────────────────────────

function parseDate(value: unknown): number | undefined {
  const s = str(value)
  if (!s) return undefined
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : undefined
}

/** Issue a request through the guarded fetch with headers (+ optional body → POST). */
function callApi(
  fetch: ConnectorFetch,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<unknown> {
  return body === undefined
    ? fetch(url, { headers })
    : fetch(url, { method: 'POST', headers, body })
}
