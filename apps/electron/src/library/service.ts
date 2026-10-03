import type { CaptureInput, CaptureResult } from './capture'
import type { LibraryJob, LibraryResource, LibraryStatus } from './types'
import type { DataService } from '../data-process/data-service'
import type { LibraryHelperStatus } from '../shared/library'
import type { LibraryGraph, LibraryGraphDetail } from '../shared/library-graph'
import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { PageSchema } from '@xnetjs/data'
import { resourceIdentityForUrl } from '@xnetjs/social/import/core'
import {
  SocialContentSchema,
  SocialEnrichmentSchema,
  createSocialEnrichmentId
} from '@xnetjs/social/schemas'
import { createTranscriptContentDrafts } from '@xnetjs/social/transcripts'
import sharp from 'sharp'
import { readPageText, saveCapture } from './capture'
import { conversationResources } from './conversations'
import { readLibraryGraph } from './graph'
import { inspectManagedHelper, installManagedHelper, MAC_VIDEO_HELPER } from './managed-helper'
import { fetchLibraryMetadata, fetchPublic, LibraryProviderError } from './providers'
import { providerResource, queueProvider } from './source'
import { LibraryStore } from './store'
import { fetchLibraryTranscript } from './transcripts'

const string = (value: unknown): string => (typeof value === 'string' ? value : '')
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export class LibraryService {
  readonly store: LibraryStore
  private identity: { authorDID: string; signingKey: number[] } | null = null
  private active = new Map<
    string,
    { job: LibraryJob; controller: AbortController; done: Promise<void> }
  >()
  private scanning: Promise<number> | null = null
  private graphRead: Promise<LibraryGraph> | null = null
  private frozen = false
  private fatal: string | null = null
  private projection: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setInterval>
  private readonly helperDirectory: string
  private helperController: AbortController | null = null
  private helperInstall: Promise<LibraryHelperStatus> | null = null
  constructor(
    private readonly data: DataService,
    dataPath: string
  ) {
    this.store = new LibraryStore(join(dataPath, 'library.db'))
    this.helperDirectory = join(dirname(dataPath), 'library-helpers')
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        this.fatal = errorMessage(error)
      })
    }, 250)
    this.timer.unref()
  }
  async helperStatus(): Promise<LibraryHelperStatus> {
    const base = { version: MAC_VIDEO_HELPER.version, bytes: MAC_VIDEO_HELPER.size }
    if (process.platform !== 'darwin')
      return {
        ...base,
        state: 'unsupported',
        reason: 'Managed video-helper installation currently supports macOS.'
      }
    if (this.helperInstall) return { ...base, state: 'installing' }
    return inspectManagedHelper(this.helperDirectory)
  }
  cancelHelper(): void {
    this.helperController?.abort()
  }
  installHelper(): Promise<LibraryHelperStatus> {
    if (process.platform !== 'darwin')
      throw new Error('Managed video-helper installation currently supports macOS.')
    if (process.env.XNET_RECOVERY_OFFLINE === 'true')
      throw new Error(
        'Review this recovered workspace and reconnect before downloading the helper.'
      )
    this.requireWritable()
    if (this.helperInstall) throw new Error('Video helper installation is already running.')
    const controller = new AbortController()
    this.helperController = controller
    this.helperInstall = installManagedHelper({
      directory: this.helperDirectory,
      signal: controller.signal,
      download: (url, signal, limit) => fetchPublic(url, { signal, limit, timeoutMs: 120_000 })
    }).finally(() => {
      this.helperInstall = null
      this.helperController = null
    })
    return this.helperInstall
  }
  configure(identity: { authorDID: string; signingKey: number[] }): void {
    if (!identity.authorDID || identity.signingKey.length !== 32)
      throw new Error('Library identity is not ready.')
    this.identity = identity
  }
  status(): LibraryStatus & { error: string | null } {
    return { ...this.store.status(), error: this.fatal }
  }
  graph(): Promise<LibraryGraph> {
    if (this.frozen)
      return Promise.reject(
        new Error('Graph is unavailable while workspace storage is being copied or imported.')
      )
    if (!this.graphRead)
      this.graphRead = (async () => {
        await this.scanning
        return readLibraryGraph(this.data, this.store)
      })().finally(() => {
        this.graphRead = null
      })
    return this.graphRead
  }
  async graphDetail(id: string): Promise<LibraryGraphDetail> {
    if (this.frozen)
      throw new Error(
        'Graph details are unavailable while workspace storage is being copied or imported.'
      )
    return {
      resource: this.store.get(id),
      source: (await this.data.getNode(id))?.properties ?? null
    }
  }
  async capture(input: CaptureInput): Promise<CaptureResult> {
    if (!this.frozen || !this.identity)
      throw new Error('Capture requires the workspace write barrier and identity.')
    return saveCapture({ input, store: this.store, data: this.data, identity: this.identity })
  }
  async recoverCaptures(): Promise<void> {
    for (const intent of this.store.pendingCaptures()) await this.capture(intent.input)
  }
  async lookup(
    url: string
  ): Promise<{ id: string; title: string; notes: { pageId: string; title: string }[] } | null> {
    const identity = resourceIdentityForUrl(url)
    const cached = this.store.byUrl(identity.url) ?? this.store.get(identity.id)
    const node = cached ? null : await this.data.getNode(identity.id)
    if (!cached && !node) return null
    return {
      id: cached?.id ?? node!.id,
      title: cached?.metadata?.title || cached?.title || string(node?.properties.title) || url,
      notes: (cached?.notes ?? []).flatMap((note) =>
        note.pageId ? [{ pageId: note.pageId, title: note.title }] : []
      )
    }
  }
  async pause(): Promise<void> {
    this.requireWritable()
    this.store.setPaused(true)
    for (const task of this.active.values()) task.controller.abort()
    await Promise.all([...this.active.values()].map((task) => task.done))
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
    for (const task of this.active.values()) task.controller.abort()
    await Promise.all([...this.active.values()].map((task) => task.done))
    await this.scanning
    await this.graphRead
  }
  thaw(): void {
    this.frozen = false
  }
  async close(): Promise<void> {
    clearInterval(this.timer)
    await this.freeze()
    this.cancelHelper()
    // Cancellation already reaches the requesting renderer; quit only waits for cleanup.
    if (this.helperInstall) await Promise.allSettled([this.helperInstall])
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
        if (props.parentContent && props.platformContentKind === 'garden-commentary') {
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
          continue
        }
        const url = string(props.canonicalUrl) || string(props.platformUrl)
        const sourceText = string(props.searchText) || string(props.textPreview)
        const remote = /^https?:\/\//.test(url)
        if (!remote && !sourceText && !string(props.title)) continue
        this.store.seed({
          id: node.id,
          ...(!remote ? { kind: 'archive-text' as const } : {}),
          platform: string(props.platform) || 'generic',
          platformContentId: string(props.platformContentId) || url || node.id,
          url,
          title: string(props.title) || url,
          sourceText,
          actor: string(props.actorHandle),
          privacy: string(props.privacyClass) || 'unknown',
          addedAt: node.createdAt
        })
        count++
      }
      offset += nodes.length
      if (nodes.length < 500) {
        for await (const resource of conversationResources(this.data)) {
          this.store.seed(resource)
          count++
        }
        await this.collectPageNotes(notes)
        this.store.replaceSourceNotes(notes)
        return count
      }
    }
  }
  private async collectPageNotes(
    notes: Map<string, NonNullable<LibraryResource['notes']>>
  ): Promise<void> {
    for (let offset = 0; ; offset += 100) {
      const pages = await this.data.listNodes({
        schemaId: PageSchema._schemaId,
        limit: 100,
        offset,
        orderBy: { createdAt: 'asc' }
      })
      for (const page of pages) {
        const sources = page.properties.sourceResources
        if (!Array.isArray(sources) || !sources.length) continue
        const bytes = await this.data.getDocumentContent(page.id)
        if (!bytes)
          throw new Error(
            `Source note ${page.id} has no saved document; search was not marked complete.`
          )
        const body = readPageText(bytes)
        for (const id of sources)
          if (typeof id === 'string')
            notes.set(id, [
              ...(notes.get(id) ?? []),
              {
                id: page.id,
                title: string(page.properties.title),
                text: body,
                url: '',
                author: page.createdBy,
                pageId: page.id
              }
            ])
      }
      if (pages.length < 100) return
    }
  }
  private async tick(): Promise<void> {
    if (
      this.frozen ||
      this.fatal ||
      this.store.paused ||
      !this.identity ||
      process.env.XNET_RECOVERY_OFFLINE === 'true'
    )
      return
    // Local indexing is already available at import. Drain repair work in bounded batches,
    // independently of network work, instead of delaying every source by one second.
    const deadline = Date.now() + 25
    for (let count = 0; count < 100 && Date.now() < deadline; count++) {
      const job = this.store.next(Date.now(), ['index'])
      if (!job) break
      const resource = this.store.get(job.resourceId)
      try {
        if (resource) this.store.index(resource)
      } catch (error) {
        this.store.finish(job, 'retry', errorMessage(error), Date.now() + 30_000)
        throw error
      }
      this.store.finish(
        job,
        resource ? 'complete' : 'unavailable',
        resource ? null : 'Source resource is missing.'
      )
    }
    while (this.active.size < 10) {
      const capabilities = (['metadata', 'thumbnail', 'transcript'] as const).filter(
        (capability) =>
          [...this.active.values()].filter((task) => task.job.capability === capability).length <
          (capability === 'metadata' ? 6 : 2)
      )
      const providers = new Map<string, number>()
      for (const task of this.active.values()) {
        const source = this.store.get(task.job.resourceId)
        if (source) {
          const provider = queueProvider(source)
          providers.set(provider, (providers.get(provider) ?? 0) + 1)
        }
      }
      // Slow requests from one host cannot occupy every worker. Pacing and Retry-After
      // remain enforced by the persistent queue, including after a restart.
      const excluded = [...providers]
        .filter(([, count]) => count >= 3)
        .map(([provider]) => provider)
      const job = this.store.next(Date.now(), capabilities, excluded)
      if (!job) break
      const key = `${job.resourceId}:${job.capability}`
      const controller = new AbortController()
      const done = this.execute(job, controller.signal)
        .catch((error: unknown) => {
          this.fatal = errorMessage(error)
        })
        .finally(() => {
          this.active.delete(key)
        })
      this.active.set(key, { job, controller, done })
    }
  }
  private async persist(drafts: DeterministicNodeImportDraft[]): Promise<void> {
    if (!this.identity) throw new Error('Library identity is not ready.')
    const identity = this.identity
    // Parallel fetches share one ordered projection writer and Lamport allocator.
    const next = this.projection.then(async () => {
      await this.data.importDeterministicNodes({
        ...identity,
        drafts,
        policy: { indexMode: 'touched', notificationMode: 'batch', syncMode: 'defer' }
      })
    })
    this.projection = next.catch(() => {})
    await next
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
    await this.persist([
      {
        id: createSocialEnrichmentId(resource.platform, resource.platformContentId),
        schemaId: SocialEnrichmentSchema._schemaId,
        properties
      }
    ])
  }
  private retain(
    id: string,
    patch: Partial<Pick<LibraryResource, 'metadata' | 'thumbnail' | 'transcript'>>
  ): LibraryResource {
    const current = this.store.get(id)
    if (!current) throw new Error('Source resource disappeared while enrichment was running.')
    // Another capability may have finished while this request was in flight.
    const next = { ...current, ...patch }
    this.store.put(next)
    return next
  }
  private async execute(job: LibraryJob, signal: AbortSignal): Promise<void> {
    const resource = this.store.get(job.resourceId)
    if (!resource) {
      this.store.finish(job, 'unavailable', 'Source resource is missing.')
      return
    }
    if (resource.kind && job.capability !== 'index') {
      this.store.finish(
        job,
        'not-applicable',
        'Text is imported locally; there is no public source to fetch.'
      )
      return
    }
    const provider = queueProvider(resource)
    const interval =
      job.capability === 'thumbnail'
        ? 250
        : ['instagram', 'tiktok'].includes(provider)
          ? 8000
          : provider === 'youtube'
            ? 1000
            : 2000
    if (job.capability !== 'index')
      this.store.pauseProvider(`${provider}:${job.capability}`, Date.now() + interval)
    try {
      if (job.capability === 'index') {
        this.store.index(resource)
        this.store.finish(job, 'complete')
        return
      }
      if (job.capability === 'metadata') {
        const metadata = await fetchLibraryMetadata(resource, signal, this.helperDirectory)
        // Retain the full result independently of bounded card projections.
        const next = this.retain(resource.id, { metadata })
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
        const next = this.retain(resource.id, {
          thumbnail: { cid, contentType, bytes: bytes.length }
        })
        await this.project(next)
        this.store.finish(job, 'complete')
        return
      }
      if (!resource.metadata) {
        this.store.finish(
          job,
          'blocked',
          'Metadata has not succeeded; caption discovery is pending.'
        )
        return
      }
      if (
        !resource.metadata.fields.captions &&
        !resource.metadata.tracks?.length &&
        providerResource(resource).platform !== 'youtube'
      ) {
        this.store.finish(job, 'not-applicable', 'This page does not expose caption tracks.')
        return
      }
      const result = await fetchLibraryTranscript(resource, signal, this.helperDirectory)
      if (result.status === 'unavailable') {
        this.store.finish(job, 'unavailable', result.reason)
        return
      }
      const { track, cues, raw, provider: captionProvider } = result.value
      const transcript: NonNullable<LibraryResource['transcript']> = {
        cues,
        language: track.language,
        autoGenerated: track.autoGenerated,
        source: 'captions',
        fetchedAt: Date.now(),
        provider: captionProvider,
        evidence: raw
      }
      this.retain(resource.id, { transcript })
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
        await this.persist(drafts.slice(offset, offset + 100))
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
      // Retry-After is a floor; a short hint must not defeat repeated-failure backoff.
      const next = Math.max(
        failure.retryAt ?? 0,
        Date.now() + Math.min(24 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(job.attempts, 10))
      )
      const state =
        failure.disposition === 'retry' && failure.scope !== 'provider' && job.attempts >= 5
          ? 'blocked'
          : failure.disposition
      this.store.finish(job, state, failure.message, next)
      if (failure.scope === 'provider') {
        const sourceHosts = [
          new URL(resource.url).hostname.replace(/^www\./, ''),
          provider.startsWith('web:') ? provider.slice(4) : `${provider}.com`,
          ...(provider === 'x' ? ['twitter.com'] : [])
        ]
        const throttledHost = failure.host
        const separateImageHost =
          job.capability === 'thumbnail' &&
          throttledHost &&
          !sourceHosts.some((host) => throttledHost === host || throttledHost.endsWith(`.${host}`))
        // A CDN's Retry-After applies to its images; repository pages can still progress.
        this.store.pauseProvider(
          separateImageHost ? `${provider}:thumbnail` : provider,
          Math.max(next, Date.now() + 60_000)
        )
      }
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
