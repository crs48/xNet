/**
 * Hook for file download in the editor.
 *
 * Connects the BlobService from context to the RichTextEditor's onFileDownload callback.
 * Resolves file CIDs to downloadable blob URLs.
 */
import { useCallback } from 'react'
import { useBlobService } from '../context/BlobContext'

export interface FileDownloadAttrs {
  cid: string
  name: string
  mimeType: string
  size: number
}

/**
 * Hook that returns an onFileDownload callback for RichTextEditor.
 *
 * Requires a BlobProvider ancestor in the component tree.
 * Returns null if no BlobService is available (graceful degradation).
 *
 * @example
 * ```tsx
 * function PageEditor({ ydoc }) {
 *   const onFileDownload = useFileDownload()
 *
 *   return (
 *     <RichTextEditor
 *       ydoc={ydoc}
 *       onFileDownload={onFileDownload ?? undefined}
 *     />
 *   )
 * }
 * ```
 */
export function useFileDownload(): ((attrs: FileDownloadAttrs) => Promise<string>) | null {
  const blobService = useBlobService()

  const handleDownload = useCallback(
    async (attrs: FileDownloadAttrs): Promise<string> => {
      if (!blobService) {
        throw new Error('BlobService not available. Wrap your app in a BlobProvider.')
      }

      // Get a blob URL for the file
      const url = await blobService.getUrl({
        cid: attrs.cid,
        name: attrs.name,
        mimeType: attrs.mimeType,
        size: attrs.size
      })

      return url
    },
    [blobService]
  )

  // Return null if no blob service, so the editor gracefully disables file download
  if (!blobService) {
    return null
  }

  return handleDownload
}
