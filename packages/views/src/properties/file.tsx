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
  /** Keep several files per cell; otherwise a new upload replaces the old. */
  allowMultiple?: boolean
  onUploadFile?: (file: File) => Promise<FileRef | null>
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
}

/** A file cell holds one ref or, with allowMultiple, several. */
export type FileCellValue = FileRef | FileRef[]

export function isImageRef(ref: FileRef | null | undefined): boolean {
  return Boolean(ref?.mimeType?.startsWith('image/'))
}

/**
 * Normalise a cell value to an array. The schema layer has always allowed
 * `FileRef[]` (schema/properties/file.ts), so imports and plugins can already
 * write arrays — every read path goes through here (exploration 0385 W2).
 */
export function toFileRefs(value: FileCellValue | null | undefined): FileRef[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list.filter((ref): ref is FileRef => Boolean(ref?.cid))
}

/**
 * Collapse back to the narrowest shape: single-file cells stay a bare object
 * so existing data and consumers are untouched.
 */
function fromFileRefs(refs: FileRef[], allowMultiple?: boolean): FileCellValue | null {
  if (refs.length === 0) return null
  if (!allowMultiple) return refs[0]
  return refs
}

/**
 * Does this file satisfy the field's `accept` list? Entries are MIME types or
 * wildcards ("image/*"), matching the HTML input attribute.
 */
export function acceptsFile(file: File, accept?: string[]): boolean {
  if (!accept?.length) return true
  return accept.some((entry) => {
    const pattern = entry.trim().toLowerCase()
    if (!pattern) return true
    if (pattern.endsWith('/*')) return file.type.toLowerCase().startsWith(pattern.slice(0, -1))
    if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern)
    return file.type.toLowerCase() === pattern
  })
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
}: PropertyEditorProps<FileCellValue>) {
  const cfg = (config ?? {}) as FileCellConfig
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const refs = toFileRefs(value)
  const multiple = Boolean(cfg.allowMultiple)

  useEffect(() => {
    if (autoFocus) rootRef.current?.querySelector('button')?.focus()
  }, [autoFocus])

  const commitRefs = (next: FileRef[]): void => {
    const collapsed = fromFileRefs(next, multiple)
    onChange(collapsed)
    onCommit?.(collapsed, 'picker-select')
  }

  /** Upload one or more files; appends when multiple, replaces otherwise. */
  const uploadAndCommit = async (files: File[]): Promise<void> => {
    if (!cfg.onUploadFile || disabled || files.length === 0) return
    const allowed = files.filter((f) => acceptsFile(f, cfg.accept))
    if (allowed.length < files.length) {
      setRejected(
        files.length === 1
          ? `${files[0].name} isn’t an accepted file type`
          : `${files.length - allowed.length} file(s) skipped — wrong type`
      )
    } else {
      setRejected(null)
    }
    if (allowed.length === 0) return

    const batch = multiple ? allowed : allowed.slice(0, 1)
    setUploading(true)
    try {
      const uploaded: FileRef[] = []
      for (const file of batch) {
        const ref = await cfg.onUploadFile(file)
        if (ref) uploaded.push(ref)
      }
      if (uploaded.length) commitRefs(multiple ? [...refs, ...uploaded] : uploaded)
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
        const dropped = Array.from(e.dataTransfer.files ?? [])
        if (dropped.length) {
          e.preventDefault()
          void uploadAndCommit(dropped)
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
      {refs.map((ref) => (
        <FileChip
          key={ref.cid}
          value={ref}
          config={config}
          siblings={refs}
          onRemove={disabled ? undefined : () => commitRefs(refs.filter((r) => r.cid !== ref.cid))}
        />
      ))}

      {!disabled && cfg.onUploadFile && (
        <>
          <button
            type="button"
            aria-label={multiple ? 'Add file' : refs.length ? 'Replace file' : 'Upload file'}
            disabled={uploading}
            className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-3 h-3" />
            {uploading ? 'Uploading…' : multiple ? 'Add' : refs.length ? 'Replace' : 'Upload'}
          </button>
          <input
            ref={inputRef}
            type="file"
            data-testid="file-input"
            accept={cfg.accept?.join(',')}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              if (picked.length) void uploadAndCommit(picked)
              e.target.value = ''
            }}
          />
        </>
      )}

      {rejected && (
        <span data-testid="file-rejected" className="text-xs text-red-500 truncate">
          {rejected}
        </span>
      )}

      {!cfg.onUploadFile && refs.length === 0 && (
        <span className="text-xs text-gray-400 italic">No upload configured</span>
      )}
    </div>
  )
}

/**
 * File property handler
 */
/** How many chips fit before collapsing the rest into a "+N" counter. */
const MAX_VISIBLE_CHIPS = 3

export const fileHandler: PropertyHandler<FileCellValue> = {
  type: 'file',

  render(value, config) {
    const refs = toFileRefs(value)
    if (refs.length === 0) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    const visible = refs.slice(0, MAX_VISIBLE_CHIPS)
    const overflow = refs.length - visible.length
    return (
      <span className="inline-flex items-center gap-1 max-w-full overflow-hidden">
        {visible.map((ref) => (
          <FileChip key={ref.cid} value={ref} config={config} siblings={refs} />
        ))}
        {overflow > 0 && (
          <span
            data-testid="file-chip-overflow"
            className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
          >
            +{overflow}
          </span>
        )}
      </span>
    )
  },

  compare(a, b) {
    // Sort on the first attachment's name; empty cells sort last.
    const aName = toFileRefs(a)[0]?.name ?? ''
    const bName = toFileRefs(b)[0]?.name ?? ''
    return aName.localeCompare(bName)
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator) {
    const isEmpty = toFileRefs(value).length === 0

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
