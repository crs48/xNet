/**
 * File reference property helper.
 */

import type { PropertyBuilder } from '../types'

/**
 * File reference stored in a file property.
 */
export interface FileRef {
  /** Content-addressed ID (CID) of the file */
  cid: string
  /** Original filename */
  name: string
  /** MIME type */
  mimeType: string
  /** File size in bytes */
  size: number
}

export interface FileOptions {
  required?: boolean
  /** Allow multiple files */
  multiple?: boolean
  /** Accepted MIME types (e.g., ['image/*', 'application/pdf']) */
  accept?: string[]
  /** Maximum file size in bytes */
  maxSize?: number
}

function isValidFileRef(value: unknown): value is FileRef {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.cid === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.mimeType === 'string' &&
    typeof obj.size === 'number'
  )
}

/**
 * Define a file reference property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     avatar: file({ accept: ['image/*'], maxSize: 5_000_000 }),
 *     attachments: file({ multiple: true })
 *   }
 * })
 * ```
 */
export function file(options: FileOptions & { multiple: true }): PropertyBuilder<FileRef[]>
export function file(options?: FileOptions): PropertyBuilder<FileRef>
export function file(options: FileOptions = {}): PropertyBuilder<FileRef | FileRef[]> {
  const isMultiple = options.multiple ?? false

  return {
    definition: {
      type: 'file',
      required: options.required ?? false,
      config: {
        multiple: isMultiple,
        accept: options.accept,
        maxSize: options.maxSize
      }
    },

    validate(value: unknown): value is FileRef | FileRef[] {
      if (value === null || value === undefined) {
        return !options.required
      }

      if (isMultiple) {
        if (!Array.isArray(value)) return false
        return value.every(isValidFileRef)
      } else {
        return isValidFileRef(value)
      }
    },

    coerce(value: unknown): FileRef | FileRef[] | null {
      if (value === null || value === undefined) {
        return isMultiple ? [] : null
      }

      if (isMultiple) {
        const arr = Array.isArray(value) ? value : [value]
        return arr.filter(isValidFileRef)
      } else {
        if (isValidFileRef(value)) {
          return value
        }
        return null
      }
    },

    _type: (isMultiple ? [] : {}) as FileRef | FileRef[]
  }
}
