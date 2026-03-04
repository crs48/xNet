/**
 * Document editor component
 *
 * Uses the shared @xnetjs/editor package for rich text editing.
 * Supports comment extensions for inline commenting.
 */
import type * as Y from 'yjs'
import {
  RichTextEditor,
  useImageUpload,
  useFileUpload,
  useFileDownload,
  type Editor as TipTapEditor
} from '@xnetjs/editor/react'

interface Props {
  doc: Y.Doc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  awareness?: any
  did?: string
  onNavigate?: (docId: string) => void
  /** Custom extensions (e.g., comment extensions) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extensions?: any[]
  /** Callback when editor is ready */
  onEditorReady?: (editor: TipTapEditor) => void
  /** Callback for creating a comment */
  onCreateComment?: (anchorData: string) => Promise<string | null>
}

export function Editor({
  doc,
  awareness,
  did,
  onNavigate,
  extensions,
  onEditorReady,
  onCreateComment
}: Props) {
  const onImageUpload = useImageUpload()
  const onFileUpload = useFileUpload()
  const onFileDownload = useFileDownload()

  return (
    <RichTextEditor
      ydoc={doc}
      field="content"
      placeholder="Start writing..."
      awareness={awareness}
      did={did}
      showToolbar={true}
      toolbarMode="desktop"
      onNavigate={onNavigate}
      onImageUpload={onImageUpload ?? undefined}
      onFileUpload={onFileUpload ?? undefined}
      onFileDownload={onFileDownload ?? undefined}
      extensions={extensions}
      onEditorReady={onEditorReady}
      onCreateComment={onCreateComment}
    />
  )
}
