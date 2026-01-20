/**
 * Document editor component
 */
import { useState, useEffect } from 'react'
import type { XDocument } from '@xnet/sdk'

interface Props {
  document: XDocument
}

export function Editor({ document }: Props) {
  const [content, setContent] = useState('')

  useEffect(() => {
    // Load content from Yjs document
    const text = document.ydoc.getText('content')
    setContent(text.toString())

    // Subscribe to changes
    const observer = () => {
      setContent(text.toString())
    }
    text.observe(observer)

    return () => {
      text.unobserve(observer)
    }
  }, [document])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)

    // Update Yjs document
    const text = document.ydoc.getText('content')
    text.delete(0, text.length)
    text.insert(0, newContent)
  }

  return (
    <textarea
      className="content-editor"
      value={content}
      onChange={handleChange}
      placeholder="Start typing..."
    />
  )
}
