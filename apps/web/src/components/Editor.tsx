/**
 * Document editor component
 *
 * Uses the shared @xnet/editor package for rich text editing.
 */
import { RichTextEditor, useImageUpload, useFileUpload, useFileDownload } from '@xnet/editor/react'
import type * as Y from 'yjs'

interface Props {
  doc: Y.Doc
  onNavigate?: (docId: string) => void
}

export function Editor({ doc, onNavigate }: Props) {
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()

  return (
    <RichTextEditor
      ydoc={doc}
      field="content"
      placeholder="Start writing..."
      onNavigate={onNavigate}
      onImageUpload={onImageUpload ?? undefined}
      onFileUpload={onFileUpload ?? undefined}
      onFileDownload={onFileDownload ?? undefined}
    />
  )
}
