/**
 * Query console input parsing (0166) — pure and unit-tested.
 * Accepts a full SavedViewDescriptor or a bare QueryAST.
 */
import { validateSavedViewDescriptor, type SavedViewDescriptor } from '@xnetjs/data'

export type ConsoleParseResult =
  | { descriptor: SavedViewDescriptor; error: null }
  | { descriptor: null; error: string }

function wrapBareQuery(parsed: Record<string, unknown>): SavedViewDescriptor {
  if (parsed.query) return parsed as unknown as SavedViewDescriptor
  return { version: 1, title: 'Console query', query: parsed } as unknown as SavedViewDescriptor
}

export function parseConsoleInput(source: string): ConsoleParseResult {
  try {
    const candidate = wrapBareQuery(JSON.parse(source) as Record<string, unknown>)
    const validation = validateSavedViewDescriptor(candidate)
    if (validation.valid) return { descriptor: candidate, error: null }
    return {
      descriptor: null,
      error: validation.errors.map((entry) => `${entry.path}: ${entry.message}`).join('\n')
    }
  } catch (parseError) {
    return {
      descriptor: null,
      error: parseError instanceof Error ? parseError.message : String(parseError)
    }
  }
}
