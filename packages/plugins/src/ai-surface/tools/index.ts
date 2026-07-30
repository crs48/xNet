/**
 * Built-in AI surface tool registry.
 *
 * `BUILT_IN_TOOL_ENTRIES` is the single registration point: `getTools()`
 * derives the definition list from it and `callTool()` dispatches through it,
 * so adding a tool means adding one entry to one group file and listing it
 * here — no switch statement to extend.
 */

import type { AiToolEntry } from './entry'
import { getAuditLogTool, validateMutationPlanTool } from './audit'
import { canvasToolEntries } from './canvas'
import { databaseToolEntries } from './database'
import {
  applyPageMarkdownTool,
  planPagePatchTool,
  readPageMarkdownTool,
  rollbackPageMarkdownTool,
  validatePageMarkdownTool
} from './page-mutation'
import { frameToolEntries } from './frames'
import { searchToolEntries } from './search'

export type { AiToolEntry } from './entry'

/**
 * All built-in tools in wire-visible registration order. The order is part of
 * the surface (agents and snapshots key off it) — append new tools to the
 * group that fits, keeping existing positions stable.
 */
export const BUILT_IN_TOOL_ENTRIES: readonly AiToolEntry[] = [
  ...searchToolEntries,
  readPageMarkdownTool,
  validatePageMarkdownTool,
  planPagePatchTool,
  applyPageMarkdownTool,
  getAuditLogTool,
  rollbackPageMarkdownTool,
  ...databaseToolEntries,
  ...canvasToolEntries,
  validateMutationPlanTool,
  // Frame placement (0346) — appended last to keep prior positions stable.
  ...frameToolEntries
]

export const BUILT_IN_TOOLS_BY_NAME: ReadonlyMap<string, AiToolEntry> = new Map(
  BUILT_IN_TOOL_ENTRIES.map((entry) => [entry.definition.name, entry])
)
