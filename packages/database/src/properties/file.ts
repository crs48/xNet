/**
 * @xnet/database - File Property Handler
 *
 * Stores references to files with metadata
 */

import type { PropertyConfig, FilterOperator, FileValue } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const fileProperty: PropertyHandler<FileValue[]> = {
  type: 'file',

  validate(value: unknown, config: PropertyConfig): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (!Array.isArray(value)) {
      return { valid: false, error: 'Must be an array of files' }
    }

    for (const file of value) {
      if (typeof file !== 'object' || file === null) {
        return { valid: false, error: 'Each file must be an object' }
      }
      const f = file as Record<string, unknown>
      if (typeof f.id !== 'string' || typeof f.name !== 'string') {
        return { valid: false, error: 'File must have id and name' }
      }
      // Check accepted types if configured
      if (config.acceptedTypes?.length && typeof f.type === 'string') {
        const fileType = f.type as string
        const accepted = config.acceptedTypes.some((pattern) => {
          if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -1)
            return fileType.startsWith(prefix)
          }
          return fileType === pattern
        })
        if (!accepted) {
          return { valid: false, error: `File type ${f.type} not accepted` }
        }
      }
      // Check max size if configured
      if (config.maxSize && typeof f.size === 'number' && f.size > config.maxSize) {
        return { valid: false, error: `File size exceeds maximum of ${config.maxSize} bytes` }
      }
    }
    return { valid: true }
  },

  coerce(value: unknown): FileValue[] | null {
    if (value === null || value === undefined) {
      return []
    }
    if (!Array.isArray(value)) {
      return []
    }
    return value.filter((f): f is FileValue => {
      return (
        typeof f === 'object' &&
        f !== null &&
        typeof (f as Record<string, unknown>).id === 'string' &&
        typeof (f as Record<string, unknown>).name === 'string'
      )
    })
  },

  format(value: FileValue[] | null): string {
    if (!value || value.length === 0) {
      return ''
    }
    if (value.length === 1) {
      return value[0].name
    }
    return `${value.length} files`
  },

  getDefaultValue(): FileValue[] | null {
    return []
  },

  isEmpty(value: FileValue[] | null): boolean {
    return value === null || value.length === 0
  },

  filterOperators: ['isEmpty', 'isNotEmpty'] as const,

  applyFilter(value: FileValue[] | null, operator: FilterOperator): boolean {
    switch (operator) {
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      default:
        return true
    }
  },

  compare(a: FileValue[] | null, b: FileValue[] | null): number {
    const aLen = a?.length ?? 0
    const bLen = b?.length ?? 0
    return aLen - bLen
  },

  serialize(value: FileValue[] | null): unknown {
    if (!value) return []
    return value.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      url: f.url
    }))
  },

  deserialize(data: unknown): FileValue[] | null {
    if (data === null || data === undefined) {
      return []
    }
    if (!Array.isArray(data)) {
      return []
    }
    return data.filter((f): f is FileValue => {
      return (
        typeof f === 'object' &&
        f !== null &&
        typeof (f as Record<string, unknown>).id === 'string' &&
        typeof (f as Record<string, unknown>).name === 'string'
      )
    })
  }
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

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

/**
 * Check if file type is an image
 */
export function isImageType(type: string): boolean {
  return type.startsWith('image/')
}
