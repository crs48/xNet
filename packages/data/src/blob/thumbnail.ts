/**
 * Attach-time thumbnail generation (exploration 0385 W4).
 *
 * A thumbnail is generated once, on the device doing the attaching, and
 * stored as its own tiny content-addressed blob. It uploads ahead of the full
 * file, so a peer's cell can show a preview long before (or without ever)
 * downloading the original — Airtable's small/large/full tiers, done locally
 * and without expiring URLs.
 *
 * Runs entirely on browser primitives; every path degrades to "no thumbnail"
 * rather than throwing, because failing to make a preview must never fail the
 * upload itself.
 */

export interface ThumbnailResult {
  /** WebP (or PNG fallback) preview bytes. */
  data: Uint8Array
  mimeType: string
  /** Intrinsic size of the *source*, not the thumbnail. */
  width: number
  height: number
}

export interface ThumbnailOptions {
  /** Longest edge of the generated preview. */
  maxDimension?: number
  quality?: number
}

const DEFAULT_MAX_DIMENSION = 320
const DEFAULT_QUALITY = 0.7

/** Can we even try? Keeps callers from importing MIME rules of their own. */
export function canThumbnail(mimeType: string): boolean {
  return (
    (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') || mimeType.startsWith('video/')
  )
}

/**
 * Generate a preview for an image or video file. Returns null when the type
 * isn't previewable, the browser lacks the APIs, or decoding fails.
 */
export async function generateThumbnail(
  file: Blob,
  mimeType: string,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult | null> {
  if (!canThumbnail(mimeType)) return null
  try {
    if (mimeType.startsWith('video/')) return await videoThumbnail(file, options)
    return await imageThumbnail(file, options)
  } catch {
    // A preview is a nicety; never let it fail the attach.
    return null
  }
}

/** Fit (w, h) inside a square of `max`, never scaling up. */
function scaleToFit(width: number, height: number, max: number): { w: number; h: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { w: width, h: height }
  const ratio = max / longest
  return { w: Math.round(width * ratio), h: Math.round(height * ratio) }
}

async function encodeCanvas(
  canvas: OffscreenCanvas,
  quality: number
): Promise<{ data: Uint8Array; mimeType: string }> {
  // WebP is materially smaller than JPEG at this size; PNG is the fallback
  // if the engine refuses the type.
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvas.convertToBlob({ type: 'image/png' })
  }
  return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type }
}

async function imageThumbnail(
  file: Blob,
  options: ThumbnailOptions
): Promise<ThumbnailResult | null> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return null
  }
  const max = options.maxDimension ?? DEFAULT_MAX_DIMENSION

  // `from-image` honours EXIF orientation — without it, phone photos come
  // out rotated relative to what the user sees everywhere else.
  const source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { w, h } = scaleToFit(source.width, source.height, max)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, w, h)
    const { data, mimeType } = await encodeCanvas(canvas, options.quality ?? DEFAULT_QUALITY)
    return { data, mimeType, width: source.width, height: source.height }
  } finally {
    source.close()
  }
}

async function videoThumbnail(
  file: Blob,
  options: ThumbnailOptions
): Promise<ThumbnailResult | null> {
  if (typeof document === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  const max = options.maxDimension ?? DEFAULT_MAX_DIMENSION
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  try {
    const frame = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const fail = (): void => resolve(null)
      video.onerror = fail
      video.onloadeddata = () => {
        // Frame 0 is very often black; nudge past it before capturing.
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2)
      }
      video.onseeked = () => resolve({ w: video.videoWidth, h: video.videoHeight })
      video.src = url
    })
    if (!frame || !frame.w || !frame.h) return null

    const { w, h } = scaleToFit(frame.w, frame.h, max)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video as unknown as CanvasImageSource, 0, 0, w, h)
    const { data, mimeType } = await encodeCanvas(canvas, options.quality ?? DEFAULT_QUALITY)
    return { data, mimeType, width: frame.w, height: frame.h }
  } finally {
    video.src = ''
    URL.revokeObjectURL(url)
  }
}
