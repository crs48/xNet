/**
 * GridPeek — the row peek panel (desktop side panel; the app shell decides
 * placement). Shows every field stacked with always-live editors, the row
 * title as a heading, and a slot for the row's comment thread.
 */

import type { GridField, GridRowData } from './model.js'
import type { CellValue, FileRef } from '@xnetjs/data'
import { isCellFileRef as isFileRef } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import { Trash2, X } from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { AttachmentLightbox } from '../attachments/AttachmentLightbox.js'
import { isImageRef, useFileUrl } from '../properties/file.js'
import { getPropertyHandler } from '../properties/index.js'

export interface GridPeekProps {
  row: GridRowData
  fields: GridField[]
  onClose: () => void
  onUpdateCell?: (rowId: string, fieldId: string, value: CellValue) => void
  onDeleteRow?: (rowId: string) => void
  onCreateOption?: (fieldId: string, name: string) => Promise<string | null>
  onUploadFile?: (file: File) => Promise<FileRef | null>
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
  readOnly?: boolean
  /** Extra content (row comments thread, activity, …) */
  children?: React.ReactNode
  className?: string
}

function PeekField({
  row,
  field,
  onUpdateCell,
  onCreateOption,
  onUploadFile,
  onResolveFileUrl,
  onOpenImage,
  readOnly
}: {
  row: GridRowData
  field: GridField
  onUpdateCell?: GridPeekProps['onUpdateCell']
  onCreateOption?: GridPeekProps['onCreateOption']
  onUploadFile?: GridPeekProps['onUploadFile']
  onResolveFileUrl?: GridPeekProps['onResolveFileUrl']
  onOpenImage?: (ref: FileRef) => void
  readOnly?: boolean
}): React.JSX.Element {
  const handler = getPropertyHandler(field.type)
  const value = row.cells[field.id] ?? null

  const config = {
    allowCreate: true,
    ...field.config,
    options: field.options,
    ...(onCreateOption ? { onCreateOption: (name: string) => onCreateOption(field.id, name) } : {}),
    ...(onUploadFile ? { onUploadFile } : {}),
    ...(onResolveFileUrl ? { onResolveFileUrl } : {})
  }

  const fileValue = field.type === 'file' && isFileRef(value) ? value : null
  const imageUrl = useFileUrl(
    fileValue && isImageRef(fileValue) ? fileValue : null,
    config as Record<string, unknown>
  )

  const commit = useCallback(
    (next: CellValue) => {
      onUpdateCell?.(row.id, field.id, next)
    },
    [onUpdateCell, row.id, field.id]
  )

  return (
    <div className="flex items-start gap-3 px-4 py-1.5 group">
      <div className="w-32 shrink-0 pt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
        {field.name}
      </div>
      <div className="flex-1 min-h-[28px] rounded px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50">
        {readOnly ? (
          <div className="pt-0.5 text-sm">{handler.render(value, config)}</div>
        ) : (
          <handler.Editor
            value={value as never}
            config={config}
            onChange={(next) => commit(next as CellValue)}
            onCommit={(next) => commit((next ?? value) as CellValue)}
          />
        )}
        {/* Inline image preview (click for lightbox) */}
        {fileValue && isImageRef(fileValue) && imageUrl && (
          <button
            type="button"
            aria-label={`Open ${fileValue.name}`}
            className="mt-1 block"
            onClick={() => onOpenImage?.(fileValue)}
          >
            <img
              src={imageUrl}
              alt={fileValue.name}
              data-testid="peek-image-preview"
              className="max-h-40 rounded border border-gray-200 dark:border-gray-700 object-contain"
            />
          </button>
        )}
      </div>
    </div>
  )
}

export function GridPeek({
  row,
  fields,
  onClose,
  onUpdateCell,
  onDeleteRow,
  onCreateOption,
  onUploadFile,
  onResolveFileUrl,
  readOnly,
  children,
  className
}: GridPeekProps): React.JSX.Element {
  const [lightbox, setLightbox] = useState<FileRef | null>(null)
  const titleField = fields.find((f) => f.isTitle)
  const title = titleField ? (row.cells[titleField.id] as string | undefined) : undefined
  const otherFields = fields.filter((f) => f.id !== titleField?.id)

  return (
    <div
      role="dialog"
      aria-label={title || 'Row details'}
      data-grid-peek
      className={cn(
        'flex flex-col h-full w-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800">
        <button
          type="button"
          aria-label="Close"
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </button>
        {!readOnly && onDeleteRow && (
          <button
            type="button"
            aria-label="Delete row"
            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => {
              onDeleteRow(row.id)
              onClose()
            }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Title */}
        <div className="px-4 pt-4 pb-2">
          {titleField && !readOnly ? (
            <input
              type="text"
              aria-label="Row title"
              defaultValue={title ?? ''}
              placeholder="Untitled"
              className="w-full text-2xl font-semibold bg-transparent outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
              onBlur={(e) => {
                const next = e.target.value
                if (next !== (title ?? '')) {
                  onUpdateCell?.(row.id, titleField.id, next || null)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                e.stopPropagation()
              }}
            />
          ) : (
            <h2 className="text-2xl font-semibold">{title || 'Untitled'}</h2>
          )}
        </div>

        {/* Fields */}
        <div className="py-2">
          {otherFields.map((field) => (
            <PeekField
              key={field.id}
              row={row}
              field={field}
              onUpdateCell={onUpdateCell}
              onCreateOption={onCreateOption}
              onUploadFile={onUploadFile}
              onResolveFileUrl={onResolveFileUrl}
              onOpenImage={setLightbox}
              readOnly={readOnly}
            />
          ))}
        </div>

        {/* Comments / extras */}
        {children && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">{children}</div>
        )}
      </div>

      {lightbox && (
        <AttachmentLightbox
          refs={[lightbox]}
          config={onResolveFileUrl ? { onResolveFileUrl } : undefined}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
