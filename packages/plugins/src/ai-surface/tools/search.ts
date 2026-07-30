/**
 * Workspace search and context tools: keyword search, graph expansion, and
 * context-pack assembly (explorations 0196/0211).
 */

import type { AiToolEntry } from './entry'
import {
  readContextSeeds,
  readOptionalNumber,
  readOptionalString,
  readRequiredString
} from '../args'

export const searchTool: AiToolEntry = {
  definition: {
    name: 'xnet_search',
    title: 'Search xNet workspace',
    description: 'Search node titles and searchable properties with pagination and limits.',
    risk: 'low',
    requiredScopes: ['workspace.search'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text.' },
        schemaId: { type: 'string', description: 'Optional schema IRI filter.' },
        limit: { type: 'number', description: 'Maximum result count.' },
        offset: { type: 'number', description: 'Result offset for pagination.' }
      },
      required: ['query']
    }
  },
  execute: async (host, args) =>
    await host.search({
      query: readRequiredString(args, 'query'),
      schemaId: readOptionalString(args, 'schemaId') ?? readOptionalString(args, 'schema'),
      limit: readOptionalNumber(args, 'limit'),
      offset: readOptionalNumber(args, 'offset')
    })
}

export const graphExpandTool: AiToolEntry = {
  definition: {
    name: 'xnet_graph_expand',
    title: 'Expand a node along its relations',
    description:
      'Walk typed relation edges out from a node to its connected neighbors (bounded by hops and a result limit). Use for just-in-time expansion: fetch a specific node’s connections only when you need them, instead of pulling the whole graph into context.',
    risk: 'low',
    requiredScopes: ['workspace.read'],
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'The node to expand from.' },
        hops: {
          type: 'number',
          description: 'How many relation hops to walk (1–2, default 1).'
        },
        limit: { type: 'number', description: 'Maximum neighbors to return.' }
      },
      required: ['nodeId']
    }
  },
  execute: async (host, args) =>
    await host.expandGraph({
      nodeId: readRequiredString(args, 'nodeId'),
      hops: readOptionalNumber(args, 'hops'),
      limit: readOptionalNumber(args, 'limit')
    })
}

export const createContextPackTool: AiToolEntry = {
  definition: {
    name: 'xnet_create_context_pack',
    title: 'Create context pack',
    description: 'Create a bounded context pack from seeds and optional search results.',
    risk: 'low',
    requiredScopes: ['workspace.read', 'workspace.search'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search query.' },
        seeds: {
          type: 'array',
          description: 'Seed resources such as pages, databases, canvases, or nodes.',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', description: 'Seed kind.' },
              id: { type: 'string', description: 'Seed id.' }
            }
          }
        },
        limit: { type: 'number', description: 'Maximum resources to include.' }
      }
    }
  },
  execute: async (host, args) =>
    await host.createContextPack({
      query: readOptionalString(args, 'query'),
      seeds: readContextSeeds(args.seeds),
      limit: readOptionalNumber(args, 'limit')
    })
}

export const createExternalContextResourceTool: AiToolEntry = {
  definition: {
    name: 'xnet_create_external_context_resource',
    title: 'Create untrusted external context resource',
    description:
      'Wrap externally fetched content as an untrusted context-pack resource with an explicit instruction boundary.',
    risk: 'medium',
    requiredScopes: ['network.fetch'],
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'External source URL.' },
        text: { type: 'string', description: 'Fetched external text content.' },
        mimeType: { type: 'string', description: 'Source MIME type. Defaults to text/plain.' }
      },
      required: ['url', 'text']
    }
  },
  execute: (host, args) =>
    host.createExternalContextResource({
      url: readRequiredString(args, 'url'),
      text: readRequiredString(args, 'text'),
      mimeType: readOptionalString(args, 'mimeType')
    })
}

export const searchToolEntries: readonly AiToolEntry[] = [
  searchTool,
  graphExpandTool,
  createContextPackTool,
  createExternalContextResourceTool
]
