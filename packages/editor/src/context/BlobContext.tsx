/**
 * BlobContext - React context providing BlobService to the editor.
 *
 * This allows editor components (like ImageNodeView) to access blob
 * upload/download functionality without prop-drilling.
 */
import type { BlobService, BlobTransferQueue } from '@xnetjs/data'
import { createContext, useContext, type ReactNode, type JSX } from 'react'

export interface BlobContextValue {
  /** Upload a file and get a FileRef */
  blobService: BlobService
  /** Moves bytes to/from the hub; absent in hub-less setups (0385 W3) */
  blobTransfers?: BlobTransferQueue
}

const BlobContext = createContext<BlobContextValue | null>(null)

export interface BlobProviderProps {
  /** The BlobService instance to provide */
  blobService: BlobService
  /** Optional hub transfer queue for cross-device attachment bytes */
  blobTransfers?: BlobTransferQueue
  children: ReactNode
}

/**
 * Provider that makes BlobService available to editor components.
 *
 * @example
 * ```tsx
 * import { BlobProvider } from '@xnetjs/editor/react'
 * import { BlobService } from '@xnetjs/data'
 *
 * function App() {
 *   const blobService = new BlobService(chunkManager)
 *   return (
 *     <BlobProvider blobService={blobService}>
 *       <RichTextEditor ydoc={ydoc} />
 *     </BlobProvider>
 *   )
 * }
 * ```
 */
export function BlobProvider({
  blobService,
  blobTransfers,
  children
}: BlobProviderProps): JSX.Element {
  return (
    <BlobContext.Provider value={{ blobService, blobTransfers }}>{children}</BlobContext.Provider>
  )
}

/**
 * Hook to access the BlobService from within the editor tree.
 *
 * Returns null if no BlobProvider is present (graceful degradation).
 */
export function useBlobService(): BlobService | null {
  const ctx = useContext(BlobContext)
  return ctx?.blobService ?? null
}

/**
 * Hook to access the hub transfer queue. Null when no provider is mounted or
 * the workspace has no hub — callers then treat blobs as local-only.
 */
export function useBlobTransfers(): BlobTransferQueue | null {
  const ctx = useContext(BlobContext)
  return ctx?.blobTransfers ?? null
}
