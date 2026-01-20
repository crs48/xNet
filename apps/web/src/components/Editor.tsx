/**
 * Document editor component
 *
 * Uses the shared @xnet/editor package for rich text editing.
 */
import { RichTextEditor } from '@xnet/editor/react'
import type { XDocument } from '@xnet/sdk'

interface Props {
  document: XDocument
  onNavigate?: (docId: string) => void
}

export function Editor({ document, onNavigate }: Props) {
  return (
    <RichTextEditor
      ydoc={document.ydoc}
      field="content"
      placeholder="Start writing..."
      onNavigate={onNavigate}
    />
  )
}
