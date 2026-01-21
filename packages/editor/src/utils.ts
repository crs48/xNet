import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names with clsx and tailwind-merge
 * This allows for proper Tailwind class merging (e.g., conflicting classes)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
