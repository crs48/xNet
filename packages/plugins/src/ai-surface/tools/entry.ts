/**
 * Registry entry contract for built-in AI surface tools.
 *
 * Each tool is one self-contained entry: its MCP-visible definition plus the
 * handler that coerces raw agent arguments and delegates to the service via
 * the narrow {@link AiSurfaceHost}. Adding a tool means adding one entry to
 * one group file — `getTools()` and `callTool()` pick it up from the registry.
 */

import type { AiSurfaceHost } from '../host'
import type { AiToolDefinition } from '../types'

export type AiToolEntry = {
  definition: AiToolDefinition
  execute(host: AiSurfaceHost, args: Record<string, unknown>): Promise<unknown> | unknown
}
