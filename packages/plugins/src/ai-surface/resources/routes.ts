/**
 * Built-in xnet:// resource routes.
 *
 * One `register` call per URI family, in the same precedence order the
 * original hand-rolled matcher used. Handlers delegate to the service through
 * the narrow {@link AiSurfaceHost}, so `readResource()` is a single
 * `resolve()` call.
 */

import type { AiSurfaceHost } from '../host'
import { readCsvStringArray, readUrlNumber } from '../args'
import { createAiResourceRouter, type AiResourceRouter } from './router'

export function createBuiltInResourceRouter(): AiResourceRouter<AiSurfaceHost> {
  return (
    createAiResourceRouter<AiSurfaceHost>()
      // ─── Workspace ────────────────────────────────────────────────────────
      .register('xnet://nodes', async (host, { uri }) =>
        host.jsonResource(uri, await host.listNodes())
      )
      .register('xnet://schemas', async (host, { uri }) =>
        host.jsonResource(uri, await host.listSchemas())
      )
      .register('xnet://workspace/summary', async (host, { uri }) =>
        host.jsonResource(uri, await host.getWorkspaceSummary())
      )
      .register('xnet://workspace/recent', async (host, { uri }) =>
        host.jsonResource(uri, await host.getRecentNodes())
      )
      .register('xnet://workspace/search', async (host, { uri, searchParams }) =>
        host.jsonResource(
          uri,
          await host.search({
            query: searchParams.get('q') ?? '',
            schemaId: searchParams.get('schema') ?? undefined,
            limit: readUrlNumber(searchParams, 'limit'),
            offset: readUrlNumber(searchParams, 'offset')
          })
        )
      )
      // ─── Nodes And Pages ──────────────────────────────────────────────────
      .register('xnet://node/{nodeId}', async (host, { uri, params }) =>
        host.jsonResource(uri, await host.getNodeProjection(params.nodeId))
      )
      .register(
        'xnet://page/{pageId}.md',
        async (host, { uri, params }) => await host.readPageMarkdown(params.pageId, true, uri)
      )
      .register(
        'xnet://page/{pageId}',
        async (host, { uri, params }) => await host.readPageMarkdown(params.pageId, true, uri)
      )
      .register('xnet://page/{pageId}/outline', async (host, { uri, params }) =>
        host.jsonResource(uri, await host.readPageOutline(params.pageId))
      )
      .register('xnet://page/{pageId}/context-pack', async (host, { uri, params }) =>
        host.jsonResource(
          uri,
          await host.createContextPack({ seeds: [{ kind: 'page', id: params.pageId }] })
        )
      )
      // ─── Databases ────────────────────────────────────────────────────────
      .register('xnet://database/{databaseId}/schema', async (host, { uri, params }) =>
        host.jsonResource(uri, await host.describeDatabase(params.databaseId))
      )
      .register('xnet://database/{databaseId}/views', async (host, { uri, params }) =>
        host.jsonResource(uri, await host.readDatabaseViews(params.databaseId))
      )
      .register(
        'xnet://database/{databaseId}/sample',
        async (host, { uri, params, searchParams }) =>
          host.jsonResource(
            uri,
            await host.sampleDatabase({
              databaseId: params.databaseId,
              sampleSize: readUrlNumber(searchParams, 'limit')
            })
          )
      )
      .register('xnet://database/{databaseId}/query', async (host, { uri, params, searchParams }) =>
        host.jsonResource(
          uri,
          await host.queryDatabase({
            databaseId: params.databaseId,
            schemaId: searchParams.get('schema') ?? undefined,
            search: searchParams.get('q') ?? undefined,
            materializedView: searchParams.get('view')
              ? { viewId: searchParams.get('view') ?? '' }
              : undefined,
            limit: readUrlNumber(searchParams, 'limit'),
            offset: readUrlNumber(searchParams, 'offset')
          })
        )
      )
      // ─── Canvases ─────────────────────────────────────────────────────────
      .register('xnet://canvas/{canvasId}/viewport', async (host, { uri, params, searchParams }) =>
        host.jsonResource(
          uri,
          await host.readCanvasViewport({
            canvasId: params.canvasId,
            x: readUrlNumber(searchParams, 'x'),
            y: readUrlNumber(searchParams, 'y'),
            w: readUrlNumber(searchParams, 'w'),
            h: readUrlNumber(searchParams, 'h'),
            tileSize: readUrlNumber(searchParams, 'tileSize'),
            tileIds: readCsvStringArray(searchParams.get('tileIds')),
            includeSourcePreviews: searchParams.get('includeSourcePreviews') === 'true'
          })
        )
      )
      .register('xnet://canvas/{canvasId}/objects', async (host, { uri, params }) =>
        host.jsonResource(uri, await host.readCanvasObjects(params.canvasId))
      )
      .register('xnet://canvas/{canvasId}/selection', async (host, { uri, params, searchParams }) =>
        host.jsonResource(
          uri,
          await host.readCanvasSelection({
            canvasId: params.canvasId,
            objectIds: readCsvStringArray(searchParams.get('ids')),
            includeSourcePreviews: searchParams.get('includeSourcePreviews') !== 'false'
          })
        )
      )
      .register(
        'xnet://canvas/{canvasId}/json-canvas',
        async (host, { uri, params, searchParams }) =>
          host.jsonResource(
            uri,
            await host.exportCanvasJsonCanvas({
              canvasId: params.canvasId,
              includeXNetMetadata: searchParams.get('includeXNetMetadata') !== 'false'
            })
          )
      )
      .register('xnet://canvas/{canvasId}/object/{objectId}', async (host, { uri, params }) =>
        host.jsonResource(uri, await host.readCanvasObject(params.canvasId, params.objectId))
      )
  )
}
