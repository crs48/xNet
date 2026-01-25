/**
 * Hook for file upload in the editor.
 *
 * Connects the BlobService from context to the RichTextEditor's onFileUpload callback.
 * Handles storage of dropped files (non-images).
 */
import { useCallback } from 'react'
import { useBlobService } from '../context/BlobContext'

export interface FileUploadResult {
  cid: string
  name: string
  mimeType: string
  size: number
}

/**
 * Hook that returns an onFileUpload callback for RichTextEditor.
 *
 * Requires a BlobProvider ancestor in the component tree.
 * Returns null if no BlobService is available (graceful degradation).
 *
 * @example
 * ```tsx
 * function PageEditor({ ydoc }) {
 *   const onFileUpload = useFileUpload()
 *
 *   return (
 *     <RichTextEditor
 *       ydoc={ydoc}
 *       onFileUpload={onFileUpload ?? undefined}
 *     />
 *   )
 * }
 * ```
 */
export function useFileUpload(): ((file: File) => Promise<FileUploadResult>) | null {
  const blobService = useBlobService()

  const handleUpload = useCallback(
    async (file: File): Promise<FileUploadResult> => {
      if (!blobService) {
        throw new Error('BlobService not available. Wrap your app in a BlobProvider.')
      }

      const fileRef = await blobService.upload(file)

      return {
        cid: fileRef.cid,
        name: fileRef.name,
        mimeType: fileRef.mimeType,
        size: fileRef.size
      }
    },
    [blobService]
  )

  // Return null if no blob service, so the editor gracefully disables file upload
  if (!blobService) {
    return null
  }

  return handleUpload
}
