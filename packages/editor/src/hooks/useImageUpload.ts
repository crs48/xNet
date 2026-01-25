/**
 * Hook for image upload in the editor.
 *
 * Connects the BlobService from context to the RichTextEditor's onImageUpload callback.
 * Handles validation, compression, and storage of pasted/dropped images.
 */
import { useCallback } from 'react'
import { useBlobService } from '../context/BlobContext'
import { uploadImage, type ImageUploadOptions } from '../services/image-upload'

export interface UseImageUploadOptions extends ImageUploadOptions {}

export interface ImageUploadResult {
  src: string
  width?: number
  height?: number
  cid?: string
}

/**
 * Hook that returns an onImageUpload callback for RichTextEditor.
 *
 * Requires a BlobProvider ancestor in the component tree.
 * Returns null if no BlobService is available (graceful degradation).
 *
 * @example
 * ```tsx
 * function PageEditor({ ydoc }) {
 *   const onImageUpload = useImageUpload()
 *
 *   return (
 *     <RichTextEditor
 *       ydoc={ydoc}
 *       onImageUpload={onImageUpload ?? undefined}
 *     />
 *   )
 * }
 * ```
 */
export function useImageUpload(
  options: UseImageUploadOptions = {}
): ((file: File) => Promise<ImageUploadResult>) | null {
  const blobService = useBlobService()

  const handleUpload = useCallback(
    async (file: File): Promise<ImageUploadResult> => {
      if (!blobService) {
        throw new Error('BlobService not available. Wrap your app in a BlobProvider.')
      }

      const result = await uploadImage(file, blobService, options)

      return {
        src: result.url,
        width: result.width,
        height: result.height,
        cid: result.fileRef.cid
      }
    },
    [blobService, options]
  )

  // Return null if no blob service, so the editor gracefully disables image upload
  if (!blobService) {
    return null
  }

  return handleUpload
}
