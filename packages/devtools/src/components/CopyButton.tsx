/**
 * Copy button component for devtools panels
 */

import { useState, useCallback } from 'react'

interface CopyButtonProps {
  getData: () => unknown
  label?: string
}

export function CopyButton({ getData, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const data = getData()
    const json = JSON.stringify(data, null, 2)
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [getData])

  return (
    <button
      onClick={handleCopy}
      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
        copied
          ? 'bg-green-600 text-white'
          : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'
      }`}
      title={`Copy all ${label.toLowerCase()} as JSON`}
    >
      {copied ? 'Copied!' : label}
    </button>
  )
}
