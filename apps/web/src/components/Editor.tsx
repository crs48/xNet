/**
 * Document editor component
 */
import { useEditor } from '@xnet/react'
import type { XDocument } from '@xnet/sdk'

interface Props {
  document: XDocument
}

export function Editor({ document }: Props) {
  const {
    content,
    handleChange,
    handleSelect,
    handleFocus,
    handleBlur
  } = useEditor({
    ydoc: document.ydoc,
    field: 'content',
    placeholder: 'Start typing...'
  })

  return (
    <textarea
      className="content-editor"
      value={content}
      onChange={handleChange}
      onSelect={handleSelect}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder="Start typing..."
    />
  )
}
