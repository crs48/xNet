/**
 * Database tools: descriptor-backed reads (describe/query/sample/explain) and
 * the plan → confirmed-apply mutation pair with transactional row rollback.
 */

import type { AiToolEntry } from './entry'
import {
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalRecord,
  readOptionalString,
  readRequiredString
} from '../args'

export const databaseDescribeTool: AiToolEntry = {
  definition: {
    name: 'xnet_database_describe',
    title: 'Describe database',
    description: 'Describe database schema, columns, views, row schema, and row counts.',
    risk: 'low',
    requiredScopes: ['database.read'],
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'Database node id.' },
        includeSample: {
          type: 'boolean',
          description: 'Include a small descriptor-backed row sample.'
        }
      },
      required: ['databaseId']
    }
  },
  execute: async (host, args) =>
    await host.describeDatabase(readRequiredString(args, 'databaseId'), {
      includeSample: readOptionalBoolean(args, 'includeSample') ?? false
    })
}

export const databaseQueryTool: AiToolEntry = {
  definition: {
    name: 'xnet_database_query',
    title: 'Query database rows',
    description:
      'Read a bounded page of database rows using NodeQueryDescriptor-compatible options.',
    risk: 'low',
    requiredScopes: ['database.read', 'database.query'],
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'Database node id.' },
        schemaId: { type: 'string', description: 'Optional row schema IRI.' },
        descriptor: {
          type: 'object',
          description: 'Optional NodeQueryDescriptor-compatible query shape.'
        },
        where: {
          type: 'object',
          description: 'Optional exact property filters for row nodes.'
        },
        search: {
          type: 'object',
          description: 'Optional NodeQueryDescriptor search filter.'
        },
        orderBy: {
          type: 'object',
          description: 'Optional NodeQueryDescriptor order map.'
        },
        materializedView: {
          type: 'object',
          description: 'Optional materialized view query options.'
        },
        count: { type: 'string', description: 'Page count mode: exact, estimate, or none.' },
        limit: { type: 'number', description: 'Maximum row count.' },
        offset: { type: 'number', description: 'Row offset.' }
      },
      required: ['databaseId']
    }
  },
  execute: async (host, args) =>
    await host.queryDatabase({
      databaseId: readRequiredString(args, 'databaseId'),
      schemaId: readOptionalString(args, 'schemaId'),
      descriptor: readOptionalRecord(args, 'descriptor'),
      where: readOptionalRecord(args, 'where'),
      search: args.search,
      orderBy: readOptionalRecord(args, 'orderBy'),
      materializedView: args.materializedView,
      count: readOptionalString(args, 'count'),
      limit: readOptionalNumber(args, 'limit'),
      offset: readOptionalNumber(args, 'offset')
    })
}

export const databaseSampleTool: AiToolEntry = {
  definition: {
    name: 'xnet_database_sample',
    title: 'Sample database rows',
    description: 'Return a small deterministic sample for schema and content inspection.',
    risk: 'low',
    requiredScopes: ['database.read', 'database.query'],
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'Database node id.' },
        schemaId: { type: 'string', description: 'Optional row schema IRI.' },
        sampleSize: { type: 'number', description: 'Sample row count.' },
        descriptor: {
          type: 'object',
          description: 'Optional NodeQueryDescriptor-compatible query shape.'
        }
      },
      required: ['databaseId']
    }
  },
  execute: async (host, args) =>
    await host.sampleDatabase({
      databaseId: readRequiredString(args, 'databaseId'),
      schemaId: readOptionalString(args, 'schemaId'),
      descriptor: readOptionalRecord(args, 'descriptor'),
      sampleSize: readOptionalNumber(args, 'sampleSize')
    })
}

export const databaseExplainQueryTool: AiToolEntry = {
  definition: {
    name: 'xnet_database_explain_query',
    title: 'Explain database query',
    description: 'Explain descriptor, pagination, materialized view, and storage plan metadata.',
    risk: 'low',
    requiredScopes: ['database.read', 'database.query', 'storage.diagnostics'],
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'Database node id.' },
        schemaId: { type: 'string', description: 'Optional row schema IRI.' },
        descriptor: {
          type: 'object',
          description: 'Optional NodeQueryDescriptor-compatible query shape.'
        },
        limit: { type: 'number', description: 'Maximum row count for the dry-run query.' },
        offset: { type: 'number', description: 'Row offset.' }
      },
      required: ['databaseId']
    }
  },
  execute: async (host, args) =>
    await host.explainDatabaseQuery({
      databaseId: readRequiredString(args, 'databaseId'),
      schemaId: readOptionalString(args, 'schemaId'),
      descriptor: readOptionalRecord(args, 'descriptor'),
      limit: readOptionalNumber(args, 'limit'),
      offset: readOptionalNumber(args, 'offset')
    })
}

export const planDatabaseMutationTool: AiToolEntry = {
  definition: {
    name: 'xnet_plan_database_mutation',
    title: 'Plan database mutation',
    description: 'Create a database mutation plan for later review without applying it.',
    risk: 'medium',
    requiredScopes: ['database.read', 'database.propose'],
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'Database node id.' },
        baseRevision: { type: 'string', description: 'Revision the mutation was based on.' },
        operations: { type: 'array', description: 'Database operations to validate.' },
        intent: { type: 'string', description: 'User or agent intent for the mutation.' },
        actor: { type: 'string', description: 'Agent or user creating the plan.' }
      },
      required: ['databaseId', 'operations']
    }
  },
  execute: async (host, args) => await host.planDatabaseMutation(args)
}

export const applyDatabaseMutationTool: AiToolEntry = {
  definition: {
    name: 'xnet_apply_database_mutation',
    title: 'Apply database mutation plan',
    description:
      'Apply a validated database row/schema mutation plan with transactional row rollback and audit logging.',
    risk: 'high',
    requiredScopes: ['database.read', 'database.write.rows', 'database.write.schema'],
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'object', description: 'Validated database mutation plan.' },
        confirmApply: {
          type: 'boolean',
          description: 'Must be true to apply the database mutation plan.'
        },
        allowStale: {
          type: 'boolean',
          description:
            'Allow applying when the plan base revision differs from the live database node.'
        }
      },
      required: ['plan', 'confirmApply']
    }
  },
  execute: async (host, args) => await host.applyDatabaseMutation(args)
}

export const databaseToolEntries: readonly AiToolEntry[] = [
  databaseDescribeTool,
  databaseQueryTool,
  databaseSampleTool,
  databaseExplainQueryTool,
  planDatabaseMutationTool,
  applyDatabaseMutationTool
]
