/**
 * Avatar image processing — turn an arbitrary uploaded picture into a small
 * square inline data URL that fits the Profile.avatar field budget (64k).
 *
 * The image is center-cropped, downscaled, and re-encoded through a canvas,
 * which as a side effect strips EXIF metadata (GPS position, device serial,
 * …) before the picture syncs to other peers.
 */

/** Matches the ProfileSchema `avatar` maxLength. */
export const AVATAR_DATA_URL_MAX = 65536

/** Rendered at ≤34px in the shell; 192px keeps retina + hovercards sharp. */
const AVATAR_SIZE = 192

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    img.src = url
  })

/**
 * Encode a file into a square avatar data URL, or throw with a
 * user-presentable message. Tries WebP first (much smaller), falls back to
 * JPEG, and steps quality down until the result fits the field budget.
 */
export async function imageToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.')
  }
  const img = await loadImage(file)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  if (side < 1) throw new Error('That image is empty.')

  const canvas = document.createElement('canvas')
  const target = Math.min(AVATAR_SIZE, side)
  canvas.width = target
  canvas.height = target
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image processing is unavailable in this browser.')
  ctx.imageSmoothingQuality = 'high'
  // Center-crop the largest square, scale it to the target size.
  const sx = (img.naturalWidth - side) / 2
  const sy = (img.naturalHeight - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target)

  const webp = canvas.toDataURL('image/webp', 0.85)
  // Browsers without WebP encoding return a PNG data URL instead.
  const candidates = webp.startsWith('data:image/webp') ? [webp] : []
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    candidates.push(canvas.toDataURL('image/jpeg', quality))
  }
  const fit = candidates.find((url) => url.length <= AVATAR_DATA_URL_MAX)
  if (!fit) throw new Error('That image could not be compressed enough — try a smaller one.')
  return fit
}
