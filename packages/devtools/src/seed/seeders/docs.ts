/**
 * Docs seeder — Pages. Creates one flagship "all block types" Page with a
 * deterministic Yjs document and anchored Comments, plus a spec Page per project
 * (linked from the Work seeder's first task of each project).
 */

import { CommentSchema, PageSchema } from '@xnetjs/data'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type { SeedDoc, SeederModule } from '../types'
import { PROJECT_NAMES, seedId } from '../seed-ids'
import { buildSamplePageDoc, buildTextAnchor } from '../docs/sample-page'
import { folderId, tagId } from './spaces'

/** Stable page node id. `pageId('spec', 'API Migration')` → spec page for that project. */
export const pageId = (kind: string, name?: string): string =>
  name === undefined ? seedId('page', kind) : seedId('page', kind, name)

const SAMPLE_TITLE = 'Sample Page - All Block Types'
const SAMPLE_ICON = '📄'

export const docsSeeder: SeederModule = {
  domain: 'docs',
  label: 'Pages & comments',
  schemaIds: [PageSchema._schemaId, CommentSchema._schemaId],
  seed: ({ space, scale }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const docs: SeedDoc[] = []

    // ─── Flagship sample page with rich Yjs content ──────────────────────
    const sampleId = pageId('sample')
    drafts.push({
      id: sampleId,
      schemaId: PageSchema._schemaId,
      properties: {
        title: SAMPLE_TITLE,
        icon: SAMPLE_ICON,
        space,
        folder: folderId('notes'),
        tags: [tagId('docs')]
      }
    })

    // Build the doc ONCE; reuse the same instance for anchors + persistence so
    // the comment RelativePositions resolve against the persisted state.
    const sampleDoc = buildSamplePageDoc(sampleId, PageSchema._schemaId, SAMPLE_TITLE, SAMPLE_ICON)
    docs.push({ nodeId: sampleId, build: () => sampleDoc })

    const fragment = sampleDoc.getXmlFragment('content')
    const commentTargets: Array<{
      slug: string
      search: string
      content: string
      resolved?: boolean
      reply?: string
    }> = [
      {
        slug: 'intro',
        search: 'all supported block types',
        content: 'This page is a great reference for testing. Should we add an embed example too?',
        reply: 'Good idea! The embed placeholder at the bottom covers that for now.'
      },
      {
        slug: 'quote',
        search: 'multiple lines of quoted text',
        content: 'Consider adding a multi-paragraph blockquote example here.'
      },
      {
        slug: 'warning',
        search: 'important notices',
        content: 'Typo fixed in the warning callout text.',
        resolved: true
      }
    ]

    for (const c of commentTargets) {
      const anchor = buildTextAnchor(fragment, c.search)
      if (!anchor) continue
      const commentId = seedId('comment', 'sample', c.slug)
      drafts.push({
        id: commentId,
        schemaId: CommentSchema._schemaId,
        properties: {
          target: sampleId,
          targetSchema: PageSchema._schemaId,
          anchorType: 'text',
          anchorData: anchor,
          content: c.content,
          resolved: Boolean(c.resolved)
        }
      })
      if (c.reply) {
        drafts.push({
          id: seedId('comment', 'sample', c.slug, 'reply'),
          schemaId: CommentSchema._schemaId,
          properties: {
            target: sampleId,
            targetSchema: PageSchema._schemaId,
            inReplyTo: commentId,
            anchorType: 'text',
            anchorData: anchor,
            content: c.reply,
            resolved: false
          }
        })
      }
    }

    // ─── Per-project spec pages (linked from Work tasks) ─────────────────
    for (const name of PROJECT_NAMES.slice(0, scale.projects)) {
      drafts.push({
        id: pageId('spec', name),
        schemaId: PageSchema._schemaId,
        properties: {
          title: `${name} — Spec`,
          icon: '📝',
          space,
          folder: folderId('work'),
          tags: [tagId('docs')]
        }
      })
    }

    return { drafts, docs }
  }
}
