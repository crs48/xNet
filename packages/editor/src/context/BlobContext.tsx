/**
 * BlobContext - React context providing BlobService to the editor.
 *
 * This allows editor components (like ImageNodeView) to access blob
 * upload/download functionality without prop-drilling.
 */
import type { BlobService } from '@xnet/data'
import { createContext, useContext, type ReactNode, type JSX } from 'react'

export interface BlobContextValue {
  /** Upload a file and get a FileRef */
  blobService: BlobService
}

const BlobContext = createContext<BlobContextValue | null>(null)

export interface BlobProviderProps {
  /** The BlobService instance to provide */
  blobService: BlobService
  children: ReactNode
}

/**
 * Provider that makes BlobService available to editor components.
 *
 * @example
 * ```tsx
 * import { BlobProvider } from '@xnet/editor/react'
 * import { BlobService } from '@xnet/data'
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
export function BlobProvider({ blobService, children }: BlobProviderProps): JSX.Element {
  return <BlobContext.Provider value={{ blobService }}>{children}</BlobContext.Provider>
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
