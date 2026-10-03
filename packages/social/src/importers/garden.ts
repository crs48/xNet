/** Authored garden commentary remains separate from the resource it describes. */
import type {
  ArchiveEntryRef,
  SocialImportAdapter,
  SocialImportContext,
  StagedSocialRecord
} from '../import/types'
import { createSocialNodeId, createSourceRecord, createStagedNode } from '../import/core'
import { resourceIdentityForUrl } from '../import/resource-url'

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const pathMatches = (path: string) => /(?:^|\/)garden\.json$/i.test(path)
export const gardenAdapter: SocialImportAdapter = {
  id: 'garden',
  version: '0.1.0',
  platform: 'generic',
  detect: (manifest) => (manifest.entries.some((entry) => pathMatches(entry.path)) ? 0.98 : 0),
  probe: ({ manifest }) => ({
    adapterId: 'garden',
    adapterVersion: '0.1.0',
    platform: 'generic',
    confidence: 0.98,
    buckets: [
      {
        id: 'garden.entries',
        label: 'Garden resources and commentary',
        description: 'Links, authored notes, tags, categories, and source-post provenance.',
        entryPaths: manifest.entries
          .filter((entry) => pathMatches(entry.path))
          .map((entry) => entry.path),
        privacyClass: 'private',
        defaultSelected: false
      }
    ],
    warnings: [
      'Imported garden entries stay private in this workspace, including entries already published elsewhere.'
    ]
  }),
  async *stage(context, selection = {}) {
    if (!selection.buckets?.includes('garden.entries') || !selection.includeSensitive) return
    for (const source of context.manifest.entries.filter((entry) => pathMatches(entry.path)))
      yield* mapGarden({ context, source, input: await context.readJsonEntry(source.path) })
  }
}

export function mapGarden(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  input: unknown
}): StagedSocialRecord[] {
  const snapshot = input.input
  if (
    !record(snapshot) ||
    snapshot.version !== 1 ||
    !record(snapshot.profile) ||
    !Array.isArray(snapshot.entries)
  )
    throw new Error('Expected a version-1 garden snapshot with profile and entries.')
  const owner = text(snapshot.profile.did) || text(snapshot.profile.handle)
  if (!owner) throw new Error('Garden profile is missing its stable author identity.')
  const base = {
    platform: 'generic' as const,
    bucketId: 'garden.entries',
    source: input.source,
    privacyClass: 'private' as const
  }
  const result: StagedSocialRecord[] = []
  const categories = new Set<string>()
  const seen = new Set<string>()
  for (const [index, value] of snapshot.entries.entries()) {
    if (!record(value) || !text(value.url))
      throw new Error(`Garden entry ${index + 1} has no source URL.`)
    const identity = resourceIdentityForUrl(text(value.url))
    const title = text(value.title) || identity.url
    const note = text(value.note)
    if (title.length > 1000 || note.length > 20000)
      throw new Error(
        `Garden entry ${index + 1} exceeds the supported title or note size; no text was truncated.`
      )
    const postUrl = text(value.source)
    if (postUrl) resourceIdentityForUrl(postUrl)
    const sourceKey = postUrl || identity.url
    if (seen.has(sourceKey))
      throw new Error(`Garden snapshot repeats an entry identity at row ${index + 1}.`)
    seen.add(sourceKey)
    const evidence = createSourceRecord({
      ...base,
      archiveId: input.context.archiveId,
      importRunId: input.context.importRunId,
      sourceRecordKind: 'content',
      sourceRecordId: sourceKey,
      payload: value
    })
    const authoredAt = text(value.createdAt)
    if (authoredAt && !Number.isFinite(Date.parse(authoredAt)))
      throw new Error(`Garden entry ${index + 1} has an invalid authored timestamp.`)
    const sourceProps = { sourceRecordId: evidence.deterministicId, ...base }
    result.push(
      evidence,
      createStagedNode({
        ...sourceProps,
        platform: identity.platform,
        kind: 'content',
        deterministicId: identity.id,
        properties: {
          contentKind: identity.kind,
          platformContentId: identity.nativeId,
          canonicalUrl: identity.url,
          title,
          observedAt: input.context.importedAt
        }
      })
    )
    // This is the author's source post, not a fetched description or a new blank Page.
    result.push(
      createStagedNode({
        ...sourceProps,
        kind: 'content',
        deterministicId: createSocialNodeId('content', ['garden-commentary', owner, sourceKey]),
        properties: {
          contentKind: 'post',
          platformContentKind: 'garden-commentary',
          platformContentId: sourceKey,
          parentContent: identity.id,
          title,
          textPreview: note.slice(0, 5000),
          searchText: note,
          ...(postUrl ? { canonicalUrl: postUrl } : {}),
          ...(authoredAt ? { publishedAt: authoredAt } : {}),
          actorHandle: text(snapshot.profile.handle),
          observedAt: input.context.importedAt,
          metadataJson: JSON.stringify({
            tags: value.tags,
            thumbnail: value.thumbnail,
            links: value.links,
            mentions: value.mentions,
            added: value.added,
            source: value.source,
            authored: true
          })
        }
      })
    )
    const names = ['Garden', text(value.category)].filter(Boolean)
    if (
      value.tags !== undefined &&
      (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== 'string'))
    )
      throw new Error(`Garden entry ${index + 1} has invalid tags.`)
    for (const name of [
      ...names,
      ...(Array.isArray(value.tags) ? value.tags.map((tag) => `#${tag}`) : [])
    ]) {
      const collectionId = createSocialNodeId('collection', ['garden', owner, name])
      if (!categories.has(name)) {
        categories.add(name)
        result.push(
          createStagedNode({
            ...sourceProps,
            kind: 'collection',
            deterministicId: collectionId,
            properties: {
              title: name,
              collectionKind: 'saved',
              platformCollectionId: `garden:${name}`,
              observedAt: input.context.importedAt
            }
          })
        )
      }
      result.push(
        createStagedNode({
          ...sourceProps,
          kind: 'collection-item',
          deterministicId: createSocialNodeId('collection-item', [
            'garden',
            owner,
            name,
            sourceKey
          ]),
          properties: {
            collection: collectionId,
            item: identity.id,
            sortKey: String(index).padStart(8, '0'),
            ...(authoredAt ? { addedAt: authoredAt } : {}),
            metadataJson: JSON.stringify({
              commentary: createSocialNodeId('content', ['garden-commentary', owner, sourceKey])
            })
          }
        })
      )
    }
  }
  return result
}
