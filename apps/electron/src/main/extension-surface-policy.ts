import type {
  ExtensionSurfaceBounds,
  ExtensionSurfaceInput
} from '../../../../packages/workbench/src/communities/extension-desktop-contract'
import { EXTENSION_CODE_LIMIT } from '../../../../packages/workbench/src/communities/extension-desktop-contract'

export const extensionCsp =
  "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
export const surfaceId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)
export function validateSurfaceInput(input: ExtensionSurfaceInput): void {
  if (
    !input ||
    !surfaceId(input.id) ||
    typeof input.title !== 'string' ||
    input.title.length > 120 ||
    typeof input.channelId !== 'string' ||
    input.channelId.length > 200 ||
    typeof input.code !== 'string' ||
    input.code.length > EXTENSION_CODE_LIMIT ||
    !input.dataset ||
    JSON.stringify(input.dataset).length > 512_000
  )
    throw new Error('Invalid extension surface.')
}
export function surfaceBounds(
  value: ExtensionSurfaceBounds | null,
  size: { width: number; height: number }
): ExtensionSurfaceBounds | null {
  if (value === null) return null
  if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite))
    throw new Error('Invalid extension bounds.')
  const x = Math.max(0, Math.round(value.x)),
    y = Math.max(0, Math.round(value.y))
  const width = Math.min(Math.round(value.width), size.width - x),
    height = Math.min(Math.round(value.height), size.height - y)
  return width >= 40 && height >= 40 ? { x, y, width, height } : null
}
export function allowedSurfaceResource(url: string, origin: string): boolean {
  return [origin + '/index.html', origin + '/runtime.js'].includes(url)
}
export type DesktopRequest = {
  operation:
    | 'files.open'
    | 'files.readText'
    | 'files.readDataURL'
    | 'files.writeText'
    | 'files.saveText'
  handle?: string
  text?: string
  name?: string
}
export function decodeDesktopRequest(value: unknown): DesktopRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid desktop request.')
  const request = value as DesktopRequest
  if (
    ![
      'files.open',
      'files.readText',
      'files.readDataURL',
      'files.writeText',
      'files.saveText'
    ].includes(request.operation) ||
    Object.keys(request).some((key) => !['operation', 'handle', 'text', 'name'].includes(key))
  )
    throw new Error('Unsupported desktop capability.')
  if (
    request.operation !== 'files.open' &&
    request.operation !== 'files.saveText' &&
    !surfaceId(request.handle)
  )
    throw new Error('A chosen file handle is required.')
  if (
    ['files.writeText', 'files.saveText'].includes(request.operation) &&
    (typeof request.text !== 'string' || Buffer.byteLength(request.text) > 2_000_000)
  )
    throw new Error('Text exceeds the two-megabyte file limit.')
  if (
    request.name !== undefined &&
    (typeof request.name !== 'string' ||
      !/^[\w .-]{1,100}$/.test(request.name) ||
      request.name === '.' ||
      request.name === '..')
  )
    throw new Error('Use a simple filename.')
  return request
}
