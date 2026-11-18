import type { ExtensionCheckAction, ExtensionCheckObservation } from './extension-check-contract'
import type { ExtensionDataset } from './extension-data'

export interface ExtensionSurfaceInput {
  id: string
  title: string
  code: string
  dataset: ExtensionDataset
  channelId: string
}
export interface ExtensionSurfaceBounds {
  x: number
  y: number
  width: number
  height: number
}
/** Installed only in trusted workspace/test renderers, never in generated UI. */
export interface ExtensionDesktopHost {
  open(input: ExtensionSurfaceInput): Promise<void>
  send(id: string, message: unknown): void
  bounds(id: string, bounds: ExtensionSurfaceBounds | null): void
  close(id: string): void
  observe(id: string): Promise<ExtensionCheckObservation>
  act(id: string, action: ExtensionCheckAction): Promise<void>
  subscribe(listener: (event: { id: string; message: unknown }) => void): () => void
}
export interface ExtensionFile {
  id: string
  name: string
  size: number
}
export interface ExtensionGuestPort {
  send(message: unknown): void
  subscribe(listener: (message: unknown) => void): () => void
}
export const EXTENSION_SOURCE_LIMIT = 200_000
export const EXTENSION_CODE_LIMIT = 800_000
