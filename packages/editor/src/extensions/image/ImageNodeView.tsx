/**
 * ImageNodeView - React NodeView for the image extension.
 *
 * Features:
 * - Upload progress indicator
 * - Resize handles (left/right)
 * - Alignment toolbar (left/center/right/full)
 * - Accessible alt text
 */
import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { cn } from '../../utils'

const ALIGNMENTS: Record<string, string> = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto',
  full: 'w-full'
}

export function ImageNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, title, width, height, alignment, uploadProgress } = node.attrs
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [resizeWidth, setResizeWidth] = React.useState<number | null>(null)
  const isResizing = resizeWidth !== null

  // Handle resize via mouse drag
  const handleResizeStart = React.useCallback(
    (e: React.MouseEvent, direction: 'left' | 'right') => {
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startWidth = containerRef.current?.offsetWidth || width || 400

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta =
          direction === 'right' ? moveEvent.clientX - startX : startX - moveEvent.clientX

        const newWidth = Math.max(100, Math.min(startWidth + delta * 2, 1200))
        setResizeWidth(newWidth)
      }

      const handleMouseUp = () => {
        if (resizeWidth !== null) {
          updateAttributes({ width: resizeWidth })
        }
        setResizeWidth(null)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [width, resizeWidth, updateAttributes]
  )

  // Upload progress state
  if (uploadProgress !== null && uploadProgress !== undefined) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'relative bg-gray-100 dark:bg-gray-800 rounded-lg',
            'flex items-center justify-center',
            ALIGNMENTS[alignment || 'center']
          )}
          style={{ width: width || 300, height: height || 200 }}
        >
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 text-gray-400">
              <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500">Uploading{alt ? ` ${alt}` : ''}...</p>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  // No src - broken image
  if (!src) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'relative bg-gray-100 dark:bg-gray-800 rounded-lg',
            'flex items-center justify-center text-gray-400',
            ALIGNMENTS[alignment || 'center']
          )}
          style={{ width: width || 300, height: height || 200 }}
        >
          <span className="text-sm">Image not available</span>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        ref={containerRef}
        className={cn(
          'relative group',
          ALIGNMENTS[alignment || 'center'],
          selected && 'ring-2 ring-blue-500 ring-offset-2 rounded-lg'
        )}
        style={{ width: isResizing ? resizeWidth : width || 'auto' }}
        data-drag-handle
      >
        {/* Image */}
        <img
          src={src}
          alt={alt || ''}
          title={title || undefined}
          className={cn('max-w-full h-auto rounded-lg', alignment === 'full' && 'w-full')}
          draggable={false}
        />

        {/* Resize handles (visible on selection) */}
        {selected && alignment !== 'full' && (
          <>
            {/* Left handle */}
            <div
              className={cn(
                'absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
                'w-3 h-12 bg-blue-500 rounded-full cursor-ew-resize',
                'opacity-0 group-hover:opacity-100 transition-opacity'
              )}
              onMouseDown={(e) => handleResizeStart(e, 'left')}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize image left"
            />
            {/* Right handle */}
            <div
              className={cn(
                'absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
                'w-3 h-12 bg-blue-500 rounded-full cursor-ew-resize',
                'opacity-0 group-hover:opacity-100 transition-opacity'
              )}
              onMouseDown={(e) => handleResizeStart(e, 'right')}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize image right"
            />
          </>
        )}

        {/* Alignment toolbar (visible on selection) */}
        {selected && (
          <div
            className={cn(
              'absolute -top-10 left-1/2 -translate-x-1/2',
              'flex items-center gap-1 p-1',
              'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
              'border border-gray-200 dark:border-gray-700'
            )}
          >
            {(['left', 'center', 'right', 'full'] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => updateAttributes({ alignment: align })}
                className={cn(
                  'p-1.5 rounded',
                  alignment === align
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                aria-label={`Align ${align}`}
                aria-pressed={alignment === align}
              >
                <AlignIcon type={align} />
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function AlignIcon({ type }: { type: 'left' | 'center' | 'right' | 'full' }) {
  const paths: Record<string, string> = {
    left: 'M3 6h18M3 12h12M3 18h18',
    center: 'M3 6h18M6 12h12M3 18h18',
    right: 'M3 6h18M9 12h12M3 18h18',
    full: 'M3 6h18M3 12h18M3 18h18'
  }

  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeWidth={2} d={paths[type]} />
    </svg>
  )
}
