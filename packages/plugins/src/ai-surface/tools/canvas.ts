/**
 * Canvas tools: bounded scene reads (list/viewport/selection/search), JSON
 * Canvas import/export, and plan-only canvas mutations.
 */

import type { AiToolEntry } from './entry'
import {
  readOptionalBoolean,
  readOptionalNumber,
  readRequiredString,
  readRequiredStringArray,
  readStringArray
} from '../args'

export const canvasListTool: AiToolEntry = {
  definition: {
    name: 'xnet_canvas_list',
    title: 'List canvases',
    description: 'List canvas nodes visible to the AI surface.',
    risk: 'low',
    requiredScopes: ['canvas.read'],
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum canvas count.' },
        offset: { type: 'number', description: 'Canvas offset.' }
      }
    }
  },
  execute: async (host, args) =>
    await host.listCanvases({
      limit: readOptionalNumber(args, 'limit'),
      offset: readOptionalNumber(args, 'offset')
    })
}

export const canvasReadViewportTool: AiToolEntry = {
  definition: {
    name: 'xnet_canvas_read_viewport',
    title: 'Read canvas viewport',
    description: 'Read canvas objects and edges intersecting a viewport.',
    risk: 'low',
    requiredScopes: ['canvas.read'],
    inputSchema: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas node id.' },
        x: { type: 'number', description: 'Viewport x.' },
        y: { type: 'number', description: 'Viewport y.' },
        w: { type: 'number', description: 'Viewport width.' },
        h: { type: 'number', description: 'Viewport height.' },
        includeSourcePreviews: {
          type: 'boolean',
          description: 'Include previews for source-backed objects.'
        },
        tileSize: { type: 'number', description: 'Optional tile size for tile scoping.' },
        tileIds: {
          type: 'array',
          description: 'Optional tile ids such as 0/1/-2 to constrain the read.',
          items: { type: 'string' }
        }
      },
      required: ['canvasId']
    }
  },
  execute: async (host, args) =>
    await host.readCanvasViewport({
      canvasId: readRequiredString(args, 'canvasId'),
      x: readOptionalNumber(args, 'x'),
      y: readOptionalNumber(args, 'y'),
      w: readOptionalNumber(args, 'w'),
      h: readOptionalNumber(args, 'h'),
      tileSize: readOptionalNumber(args, 'tileSize'),
      tileIds: readStringArray(args.tileIds),
      includeSourcePreviews: readOptionalBoolean(args, 'includeSourcePreviews') ?? false
    })
}

export const canvasReadSelectionTool: AiToolEntry = {
  definition: {
    name: 'xnet_canvas_read_selection',
    title: 'Read canvas selection',
    description: 'Read selected canvas objects, connected edges, and optional source previews.',
    risk: 'low',
    requiredScopes: ['canvas.read'],
    inputSchema: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas node id.' },
        objectIds: {
          type: 'array',
          description: 'Selected object ids.',
          items: { type: 'string' }
        },
        includeSourcePreviews: {
          type: 'boolean',
          description: 'Include previews for source-backed objects.'
        }
      },
      required: ['canvasId', 'objectIds']
    }
  },
  execute: async (host, args) =>
    await host.readCanvasSelection({
      canvasId: readRequiredString(args, 'canvasId'),
      objectIds: readRequiredStringArray(args.objectIds, 'objectIds'),
      includeSourcePreviews: readOptionalBoolean(args, 'includeSourcePreviews') ?? false
    })
}

export const canvasSearchTool: AiToolEntry = {
  definition: {
    name: 'xnet_canvas_search',
    title: 'Search canvas',
    description: 'Search canvas object text, labels, ids, and source metadata.',
    risk: 'low',
    requiredScopes: ['canvas.read'],
    inputSchema: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas node id.' },
        query: { type: 'string', description: 'Search text.' },
        limit: { type: 'number', description: 'Maximum result count.' }
      },
      required: ['canvasId', 'query']
    }
  },
  execute: async (host, args) =>
    await host.searchCanvas({
      canvasId: readRequiredString(args, 'canvasId'),
      query: readRequiredString(args, 'query'),
      limit: readOptionalNumber(args, 'limit')
    })
}

export const canvasExportJsonCanvasTool: AiToolEntry = {
  definition: {
    name: 'xnet_canvas_export_json_canvas',
    title: 'Export canvas as JSON Canvas',
    description: 'Export a canvas or viewport as JSON Canvas with xNet source metadata.',
    risk: 'low',
    requiredScopes: ['canvas.read'],
    inputSchema: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas node id.' },
        includeXNetMetadata: {
          type: 'boolean',
          description: 'Include xNet source metadata. Defaults to true.'
        },
        x: { type: 'number', description: 'Optional viewport x.' },
        y: { type: 'number', description: 'Optional viewport y.' },
        w: { type: 'number', description: 'Optional viewport width.' },
        h: { type: 'number', description: 'Optional viewport height.' }
      },
      required: ['canvasId']
    }
  },
  execute: async (host, args) =>
    await host.exportCanvasJsonCanvas({
      canvasId: readRequiredString(args, 'canvasId'),
      includeXNetMetadata: readOptionalBoolean(args, 'includeXNetMetadata') ?? true,
      x: readOptionalNumber(args, 'x'),
      y: readOptionalNumber(args, 'y'),
      w: readOptionalNumber(args, 'w'),
      h: readOptionalNumber(args, 'h')
    })
}

export const canvasPlanJsonCanvasImportTool: AiToolEntry = {
  definition: {
    name: 'xnet_canvas_plan_json_canvas_import',
    title: 'Plan JSON Canvas import',
    description: 'Convert a JSON Canvas document into a plan-only canvas mutation.',
    risk: 'medium',
    requiredScopes: ['canvas.read', 'canvas.propose'],
    inputSchema: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas node id.' },
        document: { type: 'object', description: 'JSON Canvas document.' },
        baseRevision: { type: 'string', description: 'Revision the import was based on.' },
        actor: { type: 'string', description: 'Agent or user creating the plan.' },
        intent: { type: 'string', description: 'User or agent intent for the import.' }
      },
      required: ['canvasId', 'document']
    }
  },
  execute: async (host, args) => await host.planCanvasJsonCanvasImport(args)
}

export const planCanvasMutationTool: AiToolEntry = {
  definition: {
    name: 'xnet_plan_canvas_mutation',
    title: 'Plan canvas mutation',
    description: 'Create a canvas mutation plan for later review without applying it.',
    risk: 'medium',
    requiredScopes: ['canvas.read', 'canvas.propose'],
    inputSchema: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas node id.' },
        baseRevision: { type: 'string', description: 'Revision the mutation was based on.' },
        operations: { type: 'array', description: 'Canvas operations to validate.' },
        intent: { type: 'string', description: 'User or agent intent for the mutation.' },
        actor: { type: 'string', description: 'Agent or user creating the plan.' }
      },
      required: ['canvasId', 'operations']
    }
  },
  execute: async (host, args) => await host.planCanvasMutation(args)
}

export const canvasToolEntries: readonly AiToolEntry[] = [
  canvasListTool,
  canvasReadViewportTool,
  canvasReadSelectionTool,
  canvasSearchTool,
  canvasExportJsonCanvasTool,
  canvasPlanJsonCanvasImportTool,
  planCanvasMutationTool
]
