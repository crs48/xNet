/**
 * FileNodeView - React NodeView for file attachment blocks.
 *
 * Displays file info (icon, name, size) with download button.
 * Uses emoji icons for file types (no lucide-react dependency).
 */
import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { cn } from '../../utils'

/** Map MIME type to an emoji icon */
function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '\uD83D\uDDBC\uFE0F'
  if (mimeType.startsWith('video/')) return '\uD83C\uDFA5'
  if (mimeType.startsWith('audio/')) return '\uD83C\uDFB5'
  if (mimeType.includes('pdf')) return '\uD83D\uDCC4'
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar'))
    return '\uD83D\uDCE6'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv'))
    return '\uD83D\uDCCA'
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('html') ||
    mimeType.includes('css')
  )
    return '\uD83D\uDCBB'
  if (mimeType.includes('word') || mimeType.includes('document')) return '\uD83D\uDCC3'
  return '\uD83D\uDCC1'
}

/** Format bytes to human-readable size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function FileNodeView({ node, selected, extension }: NodeViewProps) {
  const { cid, name, mimeType, size, uploadProgress } = node.attrs
  const icon = getFileIcon(mimeType || 'application/octet-stream')
  const [downloading, setDownloading] = React.useState(false)
  const [downloadError, setDownloadError] = React.useState<string | null>(null)

  const handleDownload = async () => {
    const onDownload = extension.options.onDownload as ((attrs: any) => Promise<string>) | undefined

    if (!onDownload) return

    setDownloading(true)
    setDownloadError(null)

    // Retry with exponential backoff (file may be syncing from peer)
    const maxRetries = 5
    const baseDelay = 1000

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`[FileNodeView] Download attempt ${attempt + 1}/${maxRetries} for:`, cid)
        const url = await onDownload({ cid, name, mimeType, size })
        const a = document.createElement('a')
        a.href = url
        a.download = name || 'download'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setDownloading(false)
        return // Success!
      } catch (error) {
        console.log(`[FileNodeView] Download attempt ${attempt + 1} failed:`, error)
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt)
          console.log(`[FileNodeView] Retrying in ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          console.error('Download failed after retries:', error)
          setDownloadError('File not available. It may still be syncing.')
          setDownloading(false)
        }
      }
    }
  }

  // Upload progress state
  if (uploadProgress !== null && uploadProgress !== undefined) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg my-2',
            'bg-gray-50 dark:bg-gray-800',
            'border border-gray-200 dark:border-gray-700'
          )}
        >
          <span className="text-2xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
              {name || 'Uploading...'}
            </p>
            <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.min(uploadProgress || 0, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg my-2',
          'bg-gray-50 dark:bg-gray-800',
          'border border-gray-200 dark:border-gray-700',
          'hover:bg-gray-100 dark:hover:bg-gray-750',
          'transition-colors duration-150',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
      >
        {/* File icon */}
        <span className="text-2xl flex-shrink-0">{icon}</span>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {name || 'Unknown file'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatFileSize(size || 0)}
            {mimeType && ` \u2022 ${mimeType.split('/')[1]?.toUpperCase() || mimeType}`}
          </p>
        </div>

        {/* Download button */}
        {cid && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className={cn(
              'flex-shrink-0 p-2 rounded',
              'text-gray-500 hover:text-gray-700',
              'dark:text-gray-400 dark:hover:text-gray-300',
              'hover:bg-gray-200 dark:hover:bg-gray-700',
              downloading && 'opacity-50 cursor-wait'
            )}
            aria-label={downloading ? 'Downloading...' : `Download ${name}`}
            title={downloading ? 'Downloading...' : 'Download'}
          >
            {downloading ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            )}
          </button>
        )}

        {/* Error message */}
        {downloadError && (
          <p className="text-xs text-red-500 dark:text-red-400 ml-2">{downloadError}</p>
        )}
      </div>
    </NodeViewWrapper>
  )
}
