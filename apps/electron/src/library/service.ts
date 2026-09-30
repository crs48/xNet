import type { LibraryJob, LibraryResource, LibraryStatus } from './types'
import type { DataService } from '../data-process/data-service'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  SocialContentSchema,
  SocialEnrichmentSchema,
  createSocialEnrichmentId
} from '@xnetjs/social/schemas'
import { createTranscriptContentDrafts } from '@xnetjs/social/transcripts'
import sharp from 'sharp'
import {
  chooseTrack,
  fetchLibraryMetadata,
  fetchPublic,
  LibraryProviderError,
  parseCaptionBody
} from './providers'
import { LibraryStore } from './store'

const string = (value: unknown): string => (typeof value === 'string' ? value : '')
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export class LibraryService {
  readonly store: LibraryStore
  private identity: { authorDID: string; signingKey: number[] } | null = null
  private active: Promise<void> | null = null
  private scanning: Promise<number> | null = null
  private controller: AbortController | null = null
  private frozen = false
  private fatal: string | null = null
  private timer: ReturnType<typeof setInterval>
  constructor(
    private readonly data: DataService,
    dataPath: string
  ) {
    this.store = new LibraryStore(join(dataPath, 'library.db'))
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        this.fatal = errorMessage(error)
      })
    }, 1000)
    this.timer.unref()
  }
  configure(identity: { authorDID: string; signingKey: number[] }): void {
    if (!identity.authorDID || identity.signingKey.length !== 32)
      throw new Error('Library identity is not ready.')
    this.identity = identity
  }
  status(): LibraryStatus & { error: string | null } {
    return { ...this.store.status(), error: this.fatal }
  }
  async pause(): Promise<void> {
    this.requireWritable()
    this.store.setPaused(true)
    this.controller?.abort()
    await this.active
  }
  resume(): void {
    this.requireWritable()
    if (process.env.XNET_RECOVERY_OFFLINE === 'true')
      throw new Error('Review this recovered workspace and reconnect before fetching sources.')
    if (!this.identity) throw new Error('Library identity is not ready.')
    this.fatal = null
    this.store.setPaused(false)
    void this.tick().catch((error: unknown) => {
      this.fatal = errorMessage(error)
    })
  }
  private requireWritable(): void {
    if (this.frozen)
      throw new Error('Library is paused while workspace storage is being copied or imported.')
  }
  retry(id?: string): void {
    this.requireWritable()
    this.store.retry(id)
  }
  async freeze(): Promise<void> {
    this.frozen = true
    this.controller?.abort()
    await this.active
    await this.scanning
  }
  thaw(): void {
    this.frozen = false
  }
  async close(): Promise<void> {
    clearInterval(this.timer)
    await this.freeze()
    this.store.close()
    this.identity?.signingKey.fill(0)
  }
  scan(): Promise<number> {
    if (this.frozen) return Promise.reject(new Error('Library is paused for a recovery copy.'))
    if (this.scanning) return this.scanning
    this.scanning = this.scanAll().finally(() => {
      this.scanning = null
    })
    return this.scanning
  }
  private async scanAll(): Promise<number> {
    const notes = new Map<string, NonNullable<LibraryResource['notes']>>()
    let offset = 0
    let count = 0
    for (;;) {
      const nodes = await this.data.listNodes({
        schemaId: SocialContentSchema._schemaId,
        orderBy: { createdAt: 'asc' },
        limit: 500,
        offset
      })
      for (const node of nodes) {
        const props = node.properties
        if (props.contentKind === 'transcript') continue
        if (props.parentContent) {
          if (props.platformContentKind === 'garden-commentary') {
            const parent = string(props.parentContent)
            notes.set(parent, [
              ...(notes.get(parent) ?? []),
              {
                id: node.id,
                title: string(props.title),
                text: string(props.searchText),
                url: string(props.canonicalUrl),
                author: string(props.actorHandle)
              }
            ])
          }
          continue
        }
        const url = string(props.canonicalUrl) || string(props.platformUrl)
        if (!/^https?:\/\//.test(url)) continue
        this.store.seed({
          id: node.id,
          platform: string(props.platform) || 'generic',
          platformContentId: string(props.platformContentId) || url,
          url,
          title: string(props.title) || url,
          sourceText: string(props.searchText) || string(props.textPreview),
          actor: string(props.actorHandle),
          privacy: string(props.privacyClass) || 'unknown',
          addedAt: node.createdAt
        })
        count++
      }
      offset += nodes.length
      if (nodes.length < 500) {
        this.store.replaceSourceNotes(notes)
        return count
      }
    }
  }
  private async tick(): Promise<void> {
    if (
      this.active ||
      this.frozen ||
      this.fatal ||
      this.store.paused ||
      !this.identity ||
      process.env.XNET_RECOVERY_OFFLINE === 'true'
    )
      return
    const job = this.store.next(Date.now())
    if (!job) return
    this.controller = new AbortController()
    const signal = this.controller.signal
    this.active = this.execute(job, signal)
      .catch((error: unknown) => {
        this.fatal = errorMessage(error)
      })
      .finally(() => {
        this.active = null
        this.controller = null
      })
    await this.active
  }
  private async project(resource: LibraryResource): Promise<void> {
    if (!this.identity) throw new Error('Library identity is not ready.')
    const metadata = resource.metadata
    if (!metadata) return
    const properties: Record<string, unknown> = {
      platform: resource.platform,
      platformContentId: resource.platformContentId,
      canonicalUrl: resource.url,
      status: 'resolved',
      fetchedAt: metadata.fetchedAt,
      title: (metadata.title || resource.title).slice(0, 1000),
      description: (metadata.description || '').slice(0, 5000),
      ...(metadata.provider.startsWith('github')
        ? { source: 'data-api' }
        : ['oembed', 'open-graph'].includes(metadata.provider)
          ? { source: metadata.provider }
          : {}),
      metadataJson: JSON.stringify({
        fields: metadata.fields,
        provider: metadata.provider,
        fullTextInDesktopLibrary: true,
        thumbnailContentType: resource.thumbnail?.contentType
      })
    }
    if (metadata.author) properties.authorName = metadata.author.slice(0, 500)
    if (metadata.thumbnailUrl) properties.thumbnailUrl = metadata.thumbnailUrl
    if (resource.thumbnail) properties.thumbnailBlobCid = resource.thumbnail.cid
    await this.data.importDeterministicNodes({
      ...this.identity,
      drafts: [
        {
          id: createSocialEnrichmentId(resource.platform, resource.platformContentId),
          schemaId: SocialEnrichmentSchema._schemaId,
          properties
        }
      ],
      policy: { indexMode: 'touched', notificationMode: 'batch', syncMode: 'defer' }
    })
  }
  private async execute(job: LibraryJob, signal: AbortSignal): Promise<void> {
    const resource = this.store.get(job.resourceId)
    if (!resource) {
      this.store.finish(job, 'unavailable', 'Source resource is missing.')
      return
    }
    const interval =
      resource.platform === 'instagram' ? 8000 : resource.platform === 'youtube' ? 4000 : 2000
    if (job.capability !== 'index')
      this.store.pauseProvider(resource.platform, Date.now() + interval)
    try {
      if (job.capability === 'index') {
        this.store.index(resource)
        this.store.finish(job, 'complete')
        return
      }
      if (job.capability === 'metadata') {
        const metadata = await fetchLibraryMetadata(resource, signal)
        const next = { ...resource, metadata }
        // Retain the full result independently of bounded card projections.
        this.store.put(next)
        this.store.reindex(resource.id)
        await this.project(next)
        const gaps = Object.entries(metadata.fields).filter(
          ([, field]) => field.state !== 'complete'
        )
        this.store.finish(
          job,
          gaps.length ? 'partial' : 'complete',
          gaps.length
            ? gaps.map(([name, field]) => `${name}: ${field.reason ?? field.state}`).join('; ')
            : null
        )
        return
      }
      if (job.capability === 'thumbnail') {
        const url = resource.metadata?.thumbnailUrl
        if (!url) {
          this.store.finish(
            job,
            'unavailable',
            resource.metadata
              ? 'Source returned no thumbnail.'
              : 'Metadata is unresolved; retry after it succeeds.'
          )
          return
        }
        const response = await fetchPublic(url, { signal, limit: 8 * 1024 * 1024 })
        const bytes = new Uint8Array(await response.arrayBuffer())
        const contentType = imageContentType(bytes)
        if (!contentType)
          throw new LibraryProviderError(
            'Thumbnail response is not a supported raster image.',
            'retry'
          )
        // Decode every saved poster before acknowledging it; a valid header alone is insufficient.
        await sharp(bytes, { failOn: 'warning', limitInputPixels: 40_000_000 })
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
          .raw()
          .toBuffer()
        const cid = await this.data.putBlob(bytes)
        const next = { ...resource, thumbnail: { cid, contentType, bytes: bytes.length } }
        this.store.put(next)
        await this.project(next)
        this.store.finish(job, 'complete')
        return
      }
      if (!['youtube', 'instagram', 'twitter', 'x'].includes(resource.platform)) {
        this.store.finish(job, 'not-applicable', 'This source is not a supported video provider.')
        return
      }
      if (!resource.metadata || resource.metadata.fields.captions?.state !== 'complete') {
        this.store.finish(
          job,
          'blocked',
          'Caption discovery has not succeeded. Retry metadata before caption fetching.'
        )
        return
      }
      const track = chooseTrack(resource.metadata.tracks ?? [], resource.metadata.language || 'en')
      if (!track) {
        this.store.finish(
          job,
          'unavailable',
          'No readable caption track was discovered. Local transcription has not run.'
        )
        return
      }
      const raw = await (await fetchPublic(track.url, { signal, limit: 32 * 1024 * 1024 })).text()
      const cues = parseCaptionBody(raw, track.format)
      if (!cues.length)
        throw new LibraryProviderError(
          'The discovered track returned no readable captions; availability is unresolved.',
          'retry'
        )
      const transcript: NonNullable<LibraryResource['transcript']> = {
        cues,
        language: track.language,
        autoGenerated: track.autoGenerated,
        source: 'captions',
        fetchedAt: Date.now(),
        provider: resource.metadata.provider,
        evidence: raw
      }
      const next = { ...resource, transcript }
      this.store.put(next)
      this.store.reindex(resource.id)
      const digest = createHash('sha256').update(raw).digest('hex')
      const splitCues = cues.flatMap((cue) => {
        const pieces: typeof cues = []
        for (let offset = 0; offset < cue.text.length; offset += 16000)
          pieces.push({ ...cue, text: cue.text.slice(offset, offset + 16000) })
        return pieces
      })
      const drafts: DeterministicNodeImportDraft[] = createTranscriptContentDrafts({
        platform: resource.platform,
        platformContentId: resource.platformContentId,
        videoNodeId: resource.id,
        videoTitle: resource.metadata.title || resource.title,
        canonicalUrl: resource.url,
        cues: splitCues,
        language: track.language,
        autoGenerated: track.autoGenerated,
        fetchedAtMs: transcript.fetchedAt,
        privacyClass: resource.privacy
      }).map((draft) => ({
        ...draft,
        id: `${draft.id}:${digest.slice(0, 16)}`,
        schemaId: SocialContentSchema._schemaId,
        properties: {
          ...draft.properties,
          metadataJson: JSON.stringify({
            ...(JSON.parse(draft.properties.metadataJson) as object),
            track: {
              language: track.language,
              autoGenerated: track.autoGenerated,
              provider: transcript.provider,
              sha256: digest
            }
          })
        }
      }))
      if (!this.identity) throw new Error('Library identity is not ready.')
      for (let offset = 0; offset < drafts.length; offset += 100)
        await this.data.importDeterministicNodes({
          ...this.identity,
          drafts: drafts.slice(offset, offset + 100),
          policy: { indexMode: 'touched', notificationMode: 'batch', syncMode: 'defer' }
        })
      this.store.finish(job, 'complete')
    } catch (error) {
      if (signal.aborted) {
        this.store.finish(job, 'queued', 'Paused; ready to retry.')
        return
      }
      const failure =
        error instanceof LibraryProviderError
          ? error
          : new LibraryProviderError(errorMessage(error), 'retry')
      const next =
        failure.retryAt ??
        Date.now() + Math.min(24 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(job.attempts, 10))
      const state =
        failure.disposition === 'retry' && job.attempts >= 5 ? 'blocked' : failure.disposition
      this.store.finish(job, state, failure.message, next)
      if (state === 'retry' || state === 'blocked')
        this.store.pauseProvider(resource.platform, Math.max(next, Date.now() + 60_000))
    }
  }
}

export function imageContentType(bytes: Uint8Array): string | null {
  const prefix = Buffer.from(bytes.subarray(0, 16))
  if (
    prefix.length >= 8 &&
    prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png'
  if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return 'image/jpeg'
  if (/^GIF8[79]a/.test(prefix.toString('ascii'))) return 'image/gif'
  if (prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  return null
}
