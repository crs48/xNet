import type { ChatLinkResolution, PreviewAsset } from '@xnetjs/workbench/chat-media'
import type { BrowserWindow } from 'electron'
import { getExternalReferenceOEmbedEndpoint, parseOpenGraphMetadata } from '@xnetjs/data'
import { ipcMain, shell } from 'electron'
import { fetchPreviewBytes, validatePreviewUrl } from './chat-media-fetch'

const MAX_ASSET_BYTES = 10 * 1024 * 1024
const raster = /^image\/(png|jpeg|gif|webp|avif)$/
const media =
  /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp4|wav|ogg|webm)|application\/pdf|text\/(plain|markdown|csv)|application\/json)$/
const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
const asset = (
  result: Awaited<ReturnType<typeof fetchPreviewBytes>>,
  name: string
): PreviewAsset => ({
  bytes: result.bytes,
  mimeType: result.mimeType,
  name
})

export async function resolveChatLink(raw: string): Promise<ChatLinkResolution> {
  const url = validatePreviewUrl(raw)
  const signal = AbortSignal.timeout(12000)
  const endpoint = getExternalReferenceOEmbedEndpoint({ url: url.href })
  const response = await fetchPreviewBytes(
    endpoint ?? url.href,
    endpoint ? 1024 * 1024 : MAX_ASSET_BYTES,
    signal
  )
  let title: string | undefined
  let description: string | undefined
  let provider: string | undefined
  let image: string | undefined
  if (endpoint) {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(response.bytes))
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>
      title = text(data.title, 200)
      provider = text(data.provider_name, 100)
      image = text(data.thumbnail_url, 4096)
    }
  } else if (['text/html', 'application/xhtml+xml'].includes(response.mimeType)) {
    const data = parseOpenGraphMetadata(new TextDecoder().decode(response.bytes))
    title = text(data.title, 200)
    description = text(data.description, 400)
    provider = text(data.siteName, 100)
    image = text(data.imageUrl, 4096)
  }
  const name = decodeURIComponent(url.pathname.split('/').pop() || 'Shared file').slice(0, 180)
  const result: ChatLinkResolution = {
    preview: {
      url: url.href,
      kind: 'external',
      title: title ?? (media.test(response.mimeType) && !endpoint ? name : url.hostname),
      domain: url.host,
      resolvedAt: Date.now(),
      ...(description ? { description } : {}),
      ...(provider ? { providerName: provider } : {})
    }
  }
  if (!endpoint && media.test(response.mimeType)) result.media = asset(response, name)
  else if (image) {
    try {
      const thumbnail = await fetchPreviewBytes(
        new URL(image, response.url).href,
        3 * 1024 * 1024,
        signal
      )
      if (raster.test(thumbnail.mimeType)) result.image = asset(thumbnail, 'Link preview')
      else result.warning = 'This link has no supported preview image.'
    } catch {
      result.warning = 'The preview image could not be loaded.'
    }
  }
  return result
}

export function setupChatMediaIPC(getWindow: () => BrowserWindow | null): void {
  let active = 0
  ipcMain.handle('xnet:chat:resolve-link', async (event, raw: unknown) => {
    const window = getWindow()
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('Link previews are only available to the chat window.')
    if (typeof raw !== 'string') throw new Error('Invalid preview URL.')
    if (active >= 4) throw new Error('Too many previews are loading. Try again shortly.')
    active++
    try {
      return await resolveChatLink(raw)
    } finally {
      active--
    }
  })
}

export function configureChatMediaWindow(window: BrowserWindow): void {
  // Shared links must never navigate a preload-enabled window to remote content.
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== window.webContents.getURL().split('#')[0]) event.preventDefault()
  })
  // Packaged file:// pages have no HTTP referrer. YouTube requires an app identity.
  window.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/embed/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders }
      if (details.webContentsId === window.webContents.id) headers.Referer = 'https://dev.xnet.app/'
      callback({ requestHeaders: headers })
    }
  )
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol))
        void shell
          .openExternal(url)
          .catch((error: unknown) => console.error('Could not open link', error))
    } catch {
      /* Invalid destinations remain blocked. */
    }
    return { action: 'deny' }
  })
}
