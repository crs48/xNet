/**
 * File property handler — upload, inline image thumbnails, drag-drop.
 *
 * Cell value is the content-addressed FileRef ({cid, name, mimeType, size}).
 * The surface supplies two callbacks through config:
 * - onUploadFile(file)    → persist the file (BlobService/hub), return a FileRef
 * - onResolveFileUrl(ref) → resolve a CID to a displayable URL (blob/object URL)
 *
 * Image MIME types render as inline thumbnails in cells and full previews
 * in the peek panel (see GridPeek's lightbox).
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import type { FileRef } from '@xnetjs/data'
import { Paperclip, Upload, X } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { useAttachmentLightbox } from '../attachments/AttachmentLightboxProvider.js'

export interface FileCellConfig {
  accept?: string[]
  onUploadFile?: (file: File) => Promise<FileRef | null>
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
}

export function isImageRef(ref: FileRef | null | undefined): boolean {
  return Boolean(ref?.mimeType?.startsWith('image/'))
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Resolved-URL cache so cell renders don't re-resolve the same CID
const urlCache = new Map<string, string>()

/**
 * Resolve a FileRef to a URL through config.onResolveFileUrl, with caching.
 * Returns null while resolving or when no resolver is available.
 */
export function useFileUrl(
  ref: FileRef | null | undefined,
  config?: Record<string, unknown>
): string | null {
  const resolver = (config as FileCellConfig | undefined)?.onResolveFileUrl
  const cached = ref ? (urlCache.get(ref.cid) ?? null) : null
  const [url, setUrl] = useState<string | null>(cached)

  useEffect(() => {
    if (!ref || !resolver) {
      setUrl(null)
      return
    }
    const hit = urlCache.get(ref.cid)
    if (hit) {
      setUrl(hit)
      return
    }
    let mounted = true
    resolver(ref)
      .then((resolved) => {
        urlCache.set(ref.cid, resolved)
        if (mounted) setUrl(resolved)
      })
      .catch(() => {
        if (mounted) setUrl(null)
      })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.cid, resolver])

  return url
}

/**
 * Inline chip for a file value: image thumbnail or paperclip + name.
 *
 * Clicking the chip opens the surface's AttachmentLightbox (0385 W1) with
 * every ref in the cell, so arrows page between them. Without a provider the
 * chip is inert — the property handlers stay usable standalone.
 */
function FileChip({
  value,
  config,
  siblings,
  onRemove
}: {
  value: FileRef
  config?: Record<string, unknown>
  /** All refs in this cell, so the lightbox can page through them. */
  siblings?: FileRef[]
  onRemove?: () => void
}): React.JSX.Element {
  const url = useFileUrl(value, config)
  const openLightbox = useAttachmentLightbox()

  const refs = siblings?.length ? siblings : [value]
  const previewable = Boolean(openLightbox)

  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-gray-800 dark:text-gray-200${
        previewable ? ' cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700' : ''
      }`}
      role={previewable ? 'button' : undefined}
      tabIndex={previewable ? 0 : undefined}
      aria-label={previewable ? `Open ${value.name}` : undefined}
      data-testid="file-chip"
      onClick={
        previewable
          ? (e) => {
              // Don't let the click fall through into cell edit mode.
              e.stopPropagation()
              openLightbox?.({
                refs,
                initialIndex: refs.findIndex((r) => r.cid === value.cid)
              })
            }
          : undefined
      }
      onKeyDown={
        previewable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                openLightbox?.({
                  refs,
                  initialIndex: refs.findIndex((r) => r.cid === value.cid)
                })
              }
            }
          : undefined
      }
    >
      {isImageRef(value) && url ? (
        <img
          src={url}
          alt={value.name}
          className="h-5 w-5 rounded object-cover"
          data-testid="file-thumb"
        />
      ) : (
        <Paperclip className="w-3 h-3 text-gray-500 shrink-0" />
      )}
      <span className="truncate">{value.name}</span>
      <span className="text-gray-400 shrink-0">({formatFileSize(value.size)})</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${value.name}`}
          className="text-gray-400 hover:text-red-500"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

/**
 * File editor: upload via button or drag-drop, remove existing.
 */
function FileEditor({
  value,
  config,
  onChange,
  onCommit,
  onCancel,
  onBlur,
  autoFocus,
  disabled
}: PropertyEditorProps<FileRef>) {
  const cfg = (config ?? {}) as FileCellConfig
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (autoFocus) rootRef.current?.querySelector('button')?.focus()
  }, [autoFocus])

  const uploadAndCommit = async (file: File): Promise<void> => {
    if (!cfg.onUploadFile || disabled) return
    setUploading(true)
    try {
      const ref = await cfg.onUploadFile(file)
      if (ref) {
        onChange(ref)
        onCommit?.(ref, 'picker-select')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      ref={rootRef}
      data-testid="file-editor"
      className={`flex w-full h-full items-center gap-1.5 px-1 ${dragOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && rootRef.current?.contains(next)) return
        onBlur?.()
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) {
          e.preventDefault()
          void uploadAndCommit(file)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel?.()
        }
      }}
    >
      {value && (
        <FileChip
          value={value}
          config={config}
          onRemove={
            disabled
              ? undefined
              : () => {
                  onChange(null)
                  onCommit?.(null, 'picker-select')
                }
          }
        />
      )}

      {!disabled && cfg.onUploadFile && (
        <>
          <button
            type="button"
            aria-label={value ? 'Replace file' : 'Upload file'}
            disabled={uploading}
            className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-3 h-3" />
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          </button>
          <input
            ref={inputRef}
            type="file"
            data-testid="file-input"
            accept={cfg.accept?.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadAndCommit(file)
              e.target.value = ''
            }}
          />
        </>
      )}

      {!cfg.onUploadFile && !value && (
        <span className="text-xs text-gray-400 italic">No upload configured</span>
      )}
    </div>
  )
}

/**
 * File property handler
 */
export const fileHandler: PropertyHandler<FileRef> = {
  type: 'file',

  render(value, config) {
    if (!value || !value.cid) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return <FileChip value={value} config={config} />
  },

  compare(a, b) {
    const aName = a?.name ?? ''
    const bName = b?.name ?? ''
    return aName.localeCompare(bName)
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator) {
    const isEmpty = !value || !value.cid

    switch (operator) {
      case 'isEmpty':
        return isEmpty
      case 'isNotEmpty':
        return !isEmpty
      default:
        return true
    }
  },

  Editor: FileEditor
}
