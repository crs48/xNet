/**
 * App frame source renderers (0346): how node-source frames render in
 * this app. Database nodes get the live compact database frame, pages
 * get the summary transclusion — the same components the editor embeds
 * use, registered once so every container (document, dashboard widget,
 * frame tab) resolves through one registry.
 */
import { DatabaseSchema, PageSchema } from '@xnetjs/data'
import { frameSourceRegistry } from '@xnetjs/views'
import { DatabaseEmbed } from '../components/DatabaseEmbed'
import { PageEmbedPreview } from '../components/PageEmbedPreview'

export function registerAppFrameRenderers(): void {
  if (!frameSourceRegistry.has('database')) {
    frameSourceRegistry.register({
      id: 'database',
      supportedSchemas: [DatabaseSchema._schemaId],
      component: ({ frame, nodeId, onNavigate, readOnly }) => (
        <DatabaseEmbed
          databaseId={nodeId}
          viewType={frame.viewType === 'page-preview' ? 'table' : frame.viewType}
          viewConfig={frame.config ?? {}}
          onNavigate={onNavigate}
          readOnly={readOnly}
        />
      )
    })
  }
  if (!frameSourceRegistry.has('page')) {
    frameSourceRegistry.register({
      id: 'page',
      supportedSchemas: [PageSchema._schemaId],
      component: ({ nodeId, onNavigate }) => (
        <PageEmbedPreview nodeId={nodeId} title="" onNavigate={onNavigate} />
      )
    })
  }
}

registerAppFrameRenderers()
