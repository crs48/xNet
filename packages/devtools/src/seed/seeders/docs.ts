/**
 * Docs seeder — multiple distinct rich Pages that cross-link:
 *  - a flagship "all block types" page (with anchored comments),
 *  - a Wiki Home that embeds the others,
 *  - meeting notes + an RFC,
 *  - a rich spec page per project (linked from the Work seeder's first task).
 * Pages are filed into nested folders, tagged, and use inline #tags / [[wikilinks]].
 */

import type { SeedDoc, SeederModule } from '../types'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { CommentSchema, PageSchema } from '@xnetjs/data'
import { EDITOR_DOCUMENT_FRAGMENT_FIELD } from '@xnetjs/editor/react'
import { buildRichPageDoc, type RichBlock } from '../docs/rich-pages'
import { buildSamplePageDoc, buildTextAnchor } from '../docs/sample-page'
import { PROJECT_NAMES, seedId } from '../seed-ids'
import { databaseId } from './database-drafts'

/** Stable page node id. `pageId('spec', 'API Migration')` → spec page for that project. */
export const pageId = (kind: string, name?: string): string =>
  name === undefined ? seedId('page', kind) : seedId('page', kind, name)

const SAMPLE_TITLE = 'Sample Page - All Block Types'
const SAMPLE_ICON = '📄'

export const docsSeeder: SeederModule = {
  domain: 'docs',
  label: 'Pages & comments',
  schemaIds: [PageSchema._schemaId, CommentSchema._schemaId],
  seed: ({ fixtures, scale }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const docs: SeedDoc[] = []
    const page = (
      id: string,
      title: string,
      icon: string,
      space: string,
      folderPath: string,
      tags: string[]
    ) =>
      drafts.push({
        id,
        schemaId: PageSchema._schemaId,
        properties: { title, icon, space, folder: fixtures.folder(folderPath), tags }
      })

    // ─── Flagship sample page with rich Yjs content + anchored comments ──
    const sampleId = pageId('sample')
    page(sampleId, SAMPLE_TITLE, SAMPLE_ICON, fixtures.spaces.org, 'notes', [fixtures.tag('docs')])
    const sampleDoc = buildSamplePageDoc(sampleId, PageSchema._schemaId, SAMPLE_TITLE, SAMPLE_ICON)
    docs.push({ nodeId: sampleId, build: () => sampleDoc })

    const fragment = sampleDoc.getXmlFragment(EDITOR_DOCUMENT_FRAGMENT_FIELD)
    const commentTargets = [
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
    ] as const

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
          resolved: 'resolved' in c ? c.resolved : false
        }
      })
      if ('reply' in c && c.reply) {
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

    // ─── Per-project rich spec pages (linked from Work tasks) ────────────
    const specPages = PROJECT_NAMES.slice(0, scale.projects).map((name) => ({
      id: pageId('spec', name),
      name
    }))
    for (const spec of specPages) {
      page(spec.id, `${spec.name} — Spec`, '📝', fixtures.spaces.engineering, 'work/engineering', [
        fixtures.tag('docs'),
        fixtures.tag('roadmap')
      ])
      const blocks: RichBlock[] = [
        { kind: 'h', level: 1, text: `${spec.name} — Technical Spec` },
        {
          kind: 'p',
          text: `Design doc for ${spec.name}. Tags: #docs #roadmap. See [[Wiki Home]].`
        },
        { kind: 'callout', type: 'info', text: 'Status: in review. Owner: Engineering.' },
        { kind: 'h', level: 2, text: 'Goals' },
        { kind: 'bullets', items: ['Ship v1', 'Keep p95 latency low', 'No regressions'] },
        { kind: 'h', level: 2, text: 'Open questions' },
        {
          kind: 'tasks',
          items: [
            { text: 'Decide on rollout plan', checked: false },
            { text: 'Write migration', checked: true }
          ]
        },
        {
          kind: 'code',
          lang: 'typescript',
          text: `export const ${spec.name.replace(/[^A-Za-z]/g, '')} = true`
        }
      ]
      docs.push({
        nodeId: spec.id,
        build: () =>
          buildRichPageDoc(spec.id, PageSchema._schemaId, `${spec.name} — Spec`, '📝', blocks)
      })
    }

    // ─── Wiki Home — embeds the sample page + every spec page ────────────
    const wikiId = pageId('wiki', 'home')
    page(wikiId, 'Wiki Home', '🏠', fixtures.spaces.org, 'notes', [fixtures.tag('docs')])
    docs.push({
      nodeId: wikiId,
      build: () =>
        buildRichPageDoc(wikiId, PageSchema._schemaId, 'Wiki Home', '🏠', [
          { kind: 'h', level: 1, text: 'Team Wiki' },
          { kind: 'p', text: 'Start here. Use #docs to find documentation.' },
          { kind: 'h', level: 2, text: 'Reference' },
          { kind: 'pageEmbed', pageId: sampleId, title: SAMPLE_TITLE },
          { kind: 'h', level: 2, text: 'Specs' },
          ...specPages.map(
            (s): RichBlock => ({
              kind: 'pageEmbed',
              pageId: s.id,
              title: `${s.name} — Spec`
            })
          )
        ])
    })

    // ─── Meeting notes + an RFC (design space) ──────────────────────────
    const meetingId = pageId('meeting', 'weekly')
    page(meetingId, 'Weekly Sync — Notes', '🗓️', fixtures.spaces.org, 'notes', [
      fixtures.tag('docs')
    ])
    docs.push({
      nodeId: meetingId,
      build: () =>
        buildRichPageDoc(meetingId, PageSchema._schemaId, 'Weekly Sync — Notes', '🗓️', [
          { kind: 'h', level: 1, text: 'Weekly Sync' },
          { kind: 'quote', text: 'Attendees: the whole team.' },
          { kind: 'h', level: 2, text: 'Action items' },
          {
            kind: 'tasks',
            items: [
              { text: 'Follow up on #roadmap', checked: false },
              { text: 'Review the [[API Migration — Spec]]', checked: false }
            ]
          }
        ])
    })

    const rfcId = pageId('rfc', 'design-system')
    page(rfcId, 'RFC: Design System', '🎨', fixtures.spaces.design, 'work/design', [
      fixtures.tag('design'),
      fixtures.tag('docs')
    ])
    docs.push({
      nodeId: rfcId,
      build: () =>
        buildRichPageDoc(rfcId, PageSchema._schemaId, 'RFC: Design System', '🎨', [
          { kind: 'h', level: 1, text: 'RFC: Design System' },
          { kind: 'callout', type: 'warning', text: 'Draft — feedback welcome.' },
          { kind: 'p', text: 'Proposal for tokens, components and theming. #design' },
          { kind: 'bullets', items: ['Color tokens', 'Spacing scale', 'Component API'] }
        ])
    })

    // ─── Feature Showcase — exercises every block + inline pattern ────────
    const showcaseId = pageId('showcase')
    page(showcaseId, 'Feature Showcase', '✨', fixtures.spaces.org, 'notes', [fixtures.tag('docs')])
    const trackerDb = databaseId('tracker')
    docs.push({
      nodeId: showcaseId,
      build: () =>
        buildRichPageDoc(showcaseId, PageSchema._schemaId, 'Feature Showcase', '✨', [
          { kind: 'h', level: 1, text: 'Feature Showcase' },
          {
            kind: 'p',
            text: [
              { text: 'This page exercises ' },
              { text: 'every', marks: ['bold'] },
              { text: ' editor feature — ' },
              { text: 'inline code', marks: ['code'] },
              { text: ', ' },
              { text: 'a strikethrough', marks: ['strike'] },
              { text: ', ' },
              { text: 'a link', link: 'https://xnet.fyi' },
              { text: ', a ' },
              { pill: 'hashtag', id: fixtures.tag('docs'), name: 'docs' },
              { text: ' tag, a mention ' },
              { pill: 'mention', id: fixtures.person(0), label: 'Ada' },
              { text: ', a wikilink to ' },
              { text: 'Wiki Home', wikilink: { href: wikiId, title: 'Wiki Home' } },
              { text: ', and inline math ' },
              { pill: 'math', latex: '\\sqrt{a^2 + b^2}' },
              { text: '.' }
            ]
          },
          { kind: 'callout', type: 'caution', text: 'Caution callouts work too.' },
          {
            kind: 'toggle',
            summary: 'Expand for nested content',
            children: [
              { kind: 'p', text: 'Toggles can hold any blocks:' },
              { kind: 'bullets', items: ['nested bullet one', 'nested bullet two'] }
            ]
          },
          {
            kind: 'image',
            src: 'https://placehold.co/600x300/png',
            alt: 'Placeholder',
            alignment: 'center'
          },
          {
            kind: 'file',
            cid: 'bafyseedshowcasefile',
            name: 'spec.pdf',
            mimeType: 'application/pdf',
            size: 204800
          },
          {
            kind: 'embed',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
          },
          {
            kind: 'richLink',
            url: 'https://github.com/xnetjs/xnet',
            title: 'xNet on GitHub',
            subtitle: 'Local-first workspace'
          },
          {
            kind: 'mermaid',
            code: 'graph TD; A[Idea] --> B[Spec]; B --> C[Ship];'
          },
          { kind: 'hr' },
          { kind: 'h', level: 2, text: 'Live database (board view)' },
          { kind: 'databaseEmbed', databaseId: trackerDb, viewType: 'board' },
          { kind: 'h', level: 2, text: 'My open tasks' },
          { kind: 'taskViewEmbed', scope: 'workspace', status: 'open' }
        ])
    })

    // ─── Composable frames demo (0346) — two live views of ONE database ──
    // The accounts database has lat/lng columns and a map view; editing a
    // coordinate in the table frame moves the pin in the map frame below
    // it. One store, two subscriptions — no glue code.
    const composeId = pageId('compose-demo')
    page(composeId, 'Composable Frames Demo', '🧱', fixtures.spaces.org, 'notes', [
      fixtures.tag('docs')
    ])
    const accountsDb = databaseId('accounts')
    docs.push({
      nodeId: composeId,
      build: () =>
        buildRichPageDoc(composeId, PageSchema._schemaId, 'Composable Frames Demo', '🧱', [
          { kind: 'h', level: 1, text: 'Composable Frames Demo' },
          {
            kind: 'p',
            text:
              'Two live frames of the same database. Edit a lat/lng cell in the ' +
              'table and the pin on the map below moves with it.'
          },
          { kind: 'h', level: 2, text: 'Accounts — table' },
          { kind: 'databaseEmbed', databaseId: accountsDb, viewType: 'table' },
          { kind: 'h', level: 2, text: 'Accounts — map' },
          { kind: 'databaseEmbed', databaseId: accountsDb, viewType: 'map' },
          { kind: 'h', level: 2, text: 'A transcluded page' },
          { kind: 'pageEmbed', pageId: sampleId, title: SAMPLE_TITLE }
        ])
    })

    return { drafts, docs }
  }
}
