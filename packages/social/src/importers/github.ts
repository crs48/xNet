/** GitHub stars snapshots. Native repository IDs survive renames and transfers. */
import type {
  ArchiveEntryRef,
  SocialImportAdapter,
  SocialImportContext,
  StagedSocialRecord
} from '../import/types'
import { createSocialNodeId, createSourceRecord, createStagedNode } from '../import/core'

export const GITHUB_ADAPTER_ID = 'github'
export const GITHUB_ADAPTER_VERSION = '0.1.0'
const snapshotPath = /(?:^|\/)(?:github[-_]stars(?:[-_].*)?|starred-repositories|stars)\.json$/i
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const nativeId = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? value
      : undefined

export const githubAdapter: SocialImportAdapter = {
  id: GITHUB_ADAPTER_ID,
  version: GITHUB_ADAPTER_VERSION,
  platform: 'github',
  detect: (manifest) =>
    manifest.entries.some((entry) => snapshotPath.test(entry.path)) ? 0.95 : 0,
  probe: ({ manifest }) => ({
    adapterId: GITHUB_ADAPTER_ID,
    adapterVersion: GITHUB_ADAPTER_VERSION,
    platform: 'github',
    confidence: manifest.entries.some((entry) => snapshotPath.test(entry.path)) ? 0.95 : 0,
    buckets: [
      {
        id: 'github.stars',
        label: 'Starred repositories',
        description: 'Repositories, native star events, owners, and snapshot coverage.',
        entryPaths: manifest.entries
          .filter((entry) => snapshotPath.test(entry.path))
          .map((entry) => entry.path),
        privacyClass: 'private',
        defaultSelected: false
      }
    ],
    warnings: [
      'A stars snapshot records currently visible stars; it is not a history of removed stars.'
    ]
  }),
  async *stage(context, selection = {}) {
    if (!selection.buckets?.includes('github.stars') || !selection.includeSensitive) return
    for (const source of context.manifest.entries.filter((entry) =>
      snapshotPath.test(entry.path)
    )) {
      yield* mapGitHubStars({ context, source, input: await context.readJsonEntry(source.path) })
    }
  }
}

export function mapGitHubStars(input: {
  context: Pick<SocialImportContext, 'archiveId' | 'importRunId' | 'observedBy' | 'importedAt'>
  source: ArchiveEntryRef
  input: unknown
}): StagedSocialRecord[] {
  const snapshot = record(input.input) ? input.input : undefined
  if (snapshot && snapshot.format !== 'xnet-github-stars/1')
    throw new Error('Unsupported GitHub stars snapshot format')
  const rows = snapshot?.stars ?? input.input
  if (!Array.isArray(rows)) throw new Error('Expected a GitHub stars array')
  const account =
    text(snapshot?.account)?.trim() ||
    input.context.observedBy ||
    `archive:${input.context.archiveId}`
  const self = createSocialNodeId('actor', ['github', 'self', account])
  const collection = createSocialNodeId('collection', ['github', 'stars', self])
  const base = { platform: 'github' as const, bucketId: 'github.stars', source: input.source }
  const evidence = (id: string, payload: unknown, kind: 'collection' | 'interaction') =>
    createSourceRecord({
      ...base,
      archiveId: input.context.archiveId,
      importRunId: input.context.importRunId,
      sourceRecordKind: kind,
      sourceRecordId: id,
      payload,
      privacyClass: 'private'
    })
  const catalog = evidence(
    'stars-snapshot',
    { account, coverage: snapshot?.coverage, rows: rows.length },
    'collection'
  )
  const warnings = snapshot
    ? []
    : ['Snapshot account and pagination coverage are unknown; this array may be incomplete.']
  const nodes: StagedSocialRecord[] = [
    catalog,
    createStagedNode({
      ...base,
      kind: 'actor',
      deterministicId: self,
      sourceRecordId: catalog.deterministicId,
      privacyClass: 'private',
      properties: {
        actorKind: 'account',
        platformActorId: account,
        handle: account,
        displayName: account,
        isSelf: true,
        observedBy: input.context.observedBy,
        observedAt: input.context.importedAt
      }
    }),
    createStagedNode({
      ...base,
      kind: 'collection',
      deterministicId: collection,
      sourceRecordId: catalog.deterministicId,
      privacyClass: 'private',
      warnings,
      properties: {
        collectionKind: 'saved',
        platformCollectionId: `stars:${account}`,
        title: 'Imported GitHub stars',
        ownerActor: self,
        itemCount: rows.length,
        observedAt: input.context.importedAt,
        metadataJson: JSON.stringify({
          coverage: snapshot?.coverage ?? { paginationCompleted: null },
          startedAt: snapshot?.startedAt,
          finishedAt: snapshot?.finishedAt
        })
      }
    })
  ]
  return [
    ...nodes,
    ...rows.flatMap((row: unknown, index): StagedSocialRecord[] => {
      if (!record(row)) throw new Error(`Invalid GitHub star at row ${index + 1}`)
      const repo = record(row.repo) ? row.repo : row
      const id = nativeId(repo.id)
      const name = text(repo.full_name)
      const url = text(repo.html_url)
      if (!id || !name || !url)
        throw new Error(
          `GitHub repository at row ${index + 1} is missing its native ID, full name, or URL`
        )
      const starredAt = text(row.starred_at)
      if (row.starred_at !== undefined && (!starredAt || !Number.isFinite(Date.parse(starredAt))))
        throw new Error(`Invalid native star timestamp at row ${index + 1}`)
      const owner = record(repo.owner) ? repo.owner : undefined
      const handle = text(owner?.login)
      const ownerId = nativeId(owner?.id)
      const actor =
        ownerId || handle
          ? createSocialNodeId('actor', ['github', 'owner', ownerId ?? handle])
          : undefined
      const content = createSocialNodeId('content', ['github', 'repository', id])
      const eventId = createSocialNodeId('interaction', [
        'github',
        self,
        'star',
        id,
        starredAt ?? 'time-unavailable'
      ])
      const sourceRecord = evidence(
        `star:${id}:${starredAt ?? 'time-unavailable'}:${index}`,
        row,
        'interaction'
      )
      const privacyClass = repo.private === false ? ('public' as const) : ('private' as const)
      const description = text(repo.description)
      const topics = Array.isArray(repo.topics)
        ? repo.topics.filter((topic): topic is string => typeof topic === 'string')
        : []
      return [
        sourceRecord,
        ...(actor
          ? [
              createStagedNode({
                ...base,
                kind: 'actor',
                deterministicId: actor,
                sourceRecordId: sourceRecord.deterministicId,
                privacyClass,
                properties: {
                  actorKind: 'account',
                  platformActorId: ownerId ?? handle,
                  handle,
                  displayName: handle,
                  profileUrl: text(owner?.html_url),
                  observedAt: input.context.importedAt,
                  metadataJson: JSON.stringify({ avatarUrl: owner?.avatar_url })
                }
              })
            ]
          : []),
        createStagedNode({
          ...base,
          kind: 'content',
          deterministicId: content,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass,
          properties: {
            contentKind: 'link',
            platformContentKind: 'github_repository',
            platformContentId: id,
            canonicalUrl: url,
            platformUrl: url,
            authorActor: actor,
            actorHandle: handle,
            title: name,
            textPreview: description,
            searchText: [name, description, ...topics, text(repo.language)]
              .filter(Boolean)
              .join('\n'),
            importedAt: input.context.importedAt,
            observedAt: input.context.importedAt,
            metadataJson: JSON.stringify({
              nodeId: repo.node_id,
              descriptionAvailable: description !== undefined,
              topics,
              language: repo.language,
              homepage: repo.homepage,
              license: repo.license,
              archived: repo.archived,
              disabled: repo.disabled,
              private: repo.private,
              pushedAt: repo.pushed_at,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              ownerAvatarUrl: owner?.avatar_url
            })
          }
        }),
        createStagedNode({
          ...base,
          kind: 'interaction',
          deterministicId: eventId,
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'private',
          warnings: starredAt ? [] : ['Native star timestamp is unavailable.'],
          properties: {
            interactionKind: 'star',
            platformInteractionKind: 'star',
            actor: self,
            target: content,
            targetSchema: 'SocialContent',
            targetTitle: name,
            publishedAt: starredAt,
            observedAt: input.context.importedAt,
            importedAt: input.context.importedAt,
            metadataJson: JSON.stringify({ nativeStarTimestampAvailable: Boolean(starredAt) })
          }
        }),
        createStagedNode({
          ...base,
          kind: 'collection-item',
          deterministicId: createSocialNodeId('collection-item', [collection, eventId]),
          sourceRecordId: sourceRecord.deterministicId,
          privacyClass: 'private',
          properties: {
            collection,
            item: content,
            itemSchema: 'SocialContent',
            sortKey: String(index).padStart(8, '0'),
            addedAt: starredAt
          }
        })
      ]
    })
  ]
}
