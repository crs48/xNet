/**
 * Lab agent tools (exploration 0180).
 *
 * The agentic-coding surface: MCP-shaped tools (name / description /
 * inputSchema / invoke) that let an AI agent author, run, and read Labs —
 * the write→run→read-output→fix loop. The shape mirrors the xNet MCP server
 * tools so an agent already fluent in xNet over MCP can drive Labs the same
 * way. `lab_run` needs only a ladder; the persistence tools take an injected
 * backend so this stays testable without a live NodeStore.
 */

import type { LabHostBridge, LabLanguage, LabRunResult, LabRuntimeTier } from './runtime/types'
import type { RuntimeLadder } from './runtime/ladder'
import type { LabNode } from './schema'

/** JSON-schema property (subset; matches the MCP server's property shape). */
export interface LabToolPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: readonly string[]
}

export interface LabAgentTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, LabToolPropertySchema>
    required?: string[]
  }
  invoke: (args: Record<string, unknown>) => Promise<unknown>
}

/** Persistence backend for the create/get/list tools (inject the NodeStore). */
export interface LabAgentBackend {
  createLab(input: {
    title: string
    code: string
    language: LabLanguage
    runtime: LabRuntimeTier
  }): Promise<{ id: string }>
  getLab(id: string): Promise<LabNode | null>
  listLabs(): Promise<Array<Pick<LabNode, 'id' | 'title' | 'language' | 'runtime'>>>
}

export interface LabAgentToolsOptions {
  ladder: RuntimeLadder
  host?: LabHostBridge
  /** Optional; without it only `lab_run` is available (no persistence). */
  backend?: LabAgentBackend
  /** Default wall-clock budget for agent-run Labs. */
  timeoutMs?: number
}

const LANGUAGES: readonly LabLanguage[] = ['javascript', 'typescript', 'python', 'rust', 'c']
const TIERS: readonly LabRuntimeTier[] = ['sandbox', 'app', 'server']

function asLanguage(value: unknown): LabLanguage {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
    ? (value as LabLanguage)
    : 'javascript'
}

function asTier(value: unknown): LabRuntimeTier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value)
    ? (value as LabRuntimeTier)
    : 'sandbox'
}

/** Build the Lab agent tool set. */
export function createLabAgentTools(options: LabAgentToolsOptions): LabAgentTool[] {
  const { ladder, host, backend, timeoutMs = 2000 } = options

  const runCode = (code: string, language: LabLanguage, tier: LabRuntimeTier): Promise<LabRunResult> =>
    ladder.run({ code, language, tier, host, timeoutMs })

  const tools: LabAgentTool[] = [
    {
      name: 'lab_run',
      description:
        'Run code in a Lab sandbox and return { ok, value, logs, error }. Use this to ' +
        'test code: write it, run it, read the output, and fix. JavaScript/TypeScript ' +
        'run deterministically with no DOM or network.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The source to run' },
          language: { type: 'string', enum: LANGUAGES, description: 'Default javascript' },
          tier: { type: 'string', enum: TIERS, description: 'Default sandbox' }
        },
        required: ['code']
      },
      invoke: async (args) =>
        runCode(String(args.code ?? ''), asLanguage(args.language), asTier(args.tier))
    }
  ]

  if (backend) {
    tools.push(
      {
        name: 'lab_create',
        description: 'Create a new Lab node with the given code, returning its id.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Lab name' },
            code: { type: 'string', description: 'Initial source' },
            language: { type: 'string', enum: LANGUAGES },
            runtime: { type: 'string', enum: TIERS }
          },
          required: ['title', 'code']
        },
        invoke: async (args) =>
          backend.createLab({
            title: String(args.title ?? 'Untitled Lab'),
            code: String(args.code ?? ''),
            language: asLanguage(args.language),
            runtime: asTier(args.runtime)
          })
      },
      {
        name: 'lab_get',
        description: 'Read a saved Lab by id (title, language, runtime, code).',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Lab node id' } },
          required: ['id']
        },
        invoke: async (args) => backend.getLab(String(args.id ?? ''))
      },
      {
        name: 'lab_list',
        description: 'List saved Labs (id, title, language, runtime).',
        inputSchema: { type: 'object', properties: {} },
        invoke: async () => backend.listLabs()
      },
      {
        name: 'lab_run_saved',
        description: 'Run a saved Lab by id and return its output.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Lab node id' } },
          required: ['id']
        },
        invoke: async (args) => {
          const lab = await backend.getLab(String(args.id ?? ''))
          if (!lab) return { ok: false, logs: [], error: 'Lab not found', durationMs: 0, engine: 'none' }
          return runCode(lab.code, lab.language, lab.runtime)
        }
      }
    )
  }

  return tools
}
