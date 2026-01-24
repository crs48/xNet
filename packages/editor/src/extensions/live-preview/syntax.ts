/**
 * Mapping of mark types to their markdown syntax.
 */
export interface MarkSyntax {
  /** Opening syntax characters */
  open: string
  /** Closing syntax characters */
  close: string
  /** Priority for nested marks (higher = render first) */
  priority: number
}

export const MARK_SYNTAX: Record<string, MarkSyntax> = {
  bold: { open: '**', close: '**', priority: 10 },
  italic: { open: '*', close: '*', priority: 20 },
  strike: { open: '~~', close: '~~', priority: 30 },
  code: { open: '`', close: '`', priority: 40 }
}

/**
 * Get syntax for a mark type.
 */
export function getSyntax(markType: string): MarkSyntax | null {
  return MARK_SYNTAX[markType] ?? null
}

/**
 * Get all enabled mark types.
 */
export function getEnabledMarks(options?: { marks?: string[] }): string[] {
  if (options?.marks) {
    return options.marks.filter((m) => m in MARK_SYNTAX)
  }
  return Object.keys(MARK_SYNTAX)
}
