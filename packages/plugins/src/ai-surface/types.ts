/**
 * AI surface contract types for xNet resources, tools, mutation plans, and audit events.
 */

// ─── Risk And Scope ─────────────────────────────────────────────────────────

export type AiRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type AiScope =
  | 'workspace.read'
  | 'workspace.search'
  | 'page.read'
  | 'page.propose'
  | 'page.write'
  | 'database.read'
  | 'database.query'
  | 'database.propose'
  | 'database.write.rows'
  | 'database.write.schema'
  | 'canvas.read'
  | 'canvas.propose'
  | 'canvas.write'
  | 'storage.diagnostics'
  | 'storage.recovery'
  | 'network.fetch'
  | 'agent.workspace.export'
  | 'agent.workspace.import'
  | 'agent.approve'
  | 'agent.notifications'

export const AI_RISK_LEVELS: readonly AiRiskLevel[] = ['low', 'medium', 'high', 'critical']

export const AI_SCOPES: readonly AiScope[] = [
  'workspace.read',
  'workspace.search',
  'page.read',
  'page.propose',
  'page.write',
  'database.read',
  'database.query',
  'database.propose',
  'database.write.rows',
  'database.write.schema',
  'canvas.read',
  'canvas.propose',
  'canvas.write',
  'storage.diagnostics',
  'storage.recovery',
  'network.fetch',
  'agent.workspace.export',
  'agent.workspace.import',
  'agent.approve',
  'agent.notifications'
]

export type AiTargetKind =
  | 'workspace'
  | 'node'
  | 'page'
  | 'database'
  | 'databaseRows'
  | 'canvas'
  | 'storage'

export const AI_TARGET_KINDS: readonly AiTargetKind[] = [
  'workspace',
  'node',
  'page',
  'database',
  'databaseRows',
  'canvas',
  'storage'
]

// ─── Schema Shapes ──────────────────────────────────────────────────────────

export type AiJsonSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export type AiJsonSchema = {
  type: AiJsonSchemaType
  description?: string
  enum?: readonly string[]
  properties?: Record<string, AiJsonSchema>
  required?: readonly string[]
  items?: AiJsonSchema
  additionalProperties?: boolean | AiJsonSchema
}

// ─── Resources And Tools ────────────────────────────────────────────────────

export type AiResource = {
  uri: string
  name: string
  description?: string
  mimeType: string
  risk: AiRiskLevel
  requiredScopes: AiScope[]
  dynamic?: boolean
}

export type AiToolDefinition = {
  name: string
  title: string
  description: string
  risk: AiRiskLevel
  requiredScopes: AiScope[]
  inputSchema: {
    type: 'object'
    properties: Record<string, AiJsonSchema>
    required?: readonly string[]
  }
}

export type AiToolCallResult = {
  content: Array<{ type: 'text'; text: string }>
}

/**
 * A tool the AI surface can list and call but whose implementation lives outside
 * the surface (a plugin/connector contribution, exploration 0196). `invoke`
 * returns raw data; the surface serializes it for the model, keeping contributed
 * tools symmetric with the built-in `xnet_*` tools.
 */
export type AiExtraTool = AiToolDefinition & {
  invoke: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

// ─── Mutation Plans ─────────────────────────────────────────────────────────

export type AiValidationResult = {
  valid: boolean
  warnings: string[]
  errors: string[]
}

export type AiOperation<TArgs extends Record<string, unknown> = Record<string, unknown>> = {
  op: string
  args: TArgs
  rationale?: string
}

export type AiChangeSet = {
  targetKind: AiTargetKind
  targetId: string
  baseRevision: string
  operations: AiOperation[]
}

export type AiMutationPlanStatus = 'proposed' | 'validated' | 'applied' | 'rejected'

export type AiMutationPlan = {
  id: string
  workspaceId?: string
  actor: string
  intent: string
  risk: AiRiskLevel
  requiredScopes: AiScope[]
  changes: AiChangeSet[]
  validation: AiValidationResult
  createdAt: string
  status: AiMutationPlanStatus
}

export type AiAuditEvent = {
  id: string
  planId: string
  actor: string
  risk: AiRiskLevel
  requiredScopes: AiScope[]
  validation: AiValidationResult
  appliedChangeIds: string[]
  rollbackHandle?: string
  createdAt: string
}

// ─── Context Packs ──────────────────────────────────────────────────────────

export type AiContextSeed = {
  kind: AiTargetKind
  id: string
}

export type AiContextPackResource = {
  uri: string
  mimeType: string
  text: string
  trust: {
    level: 'workspace' | 'external-untrusted'
    instructionBoundary: string
  }
  citation: {
    kind: AiTargetKind
    id: string
    revision?: string
  }
}

export type AiContextPack = {
  id: string
  query?: string
  seeds: AiContextSeed[]
  resources: AiContextPackResource[]
  createdAt: string
  limits: {
    maxResources: number
    maxCharactersPerResource: number
  }
}

// ─── Type Guards ────────────────────────────────────────────────────────────

export function isAiRiskLevel(value: unknown): value is AiRiskLevel {
  return typeof value === 'string' && AI_RISK_LEVELS.includes(value as AiRiskLevel)
}

export function isAiScope(value: unknown): value is AiScope {
  return typeof value === 'string' && AI_SCOPES.includes(value as AiScope)
}

export function isAiTargetKind(value: unknown): value is AiTargetKind {
  return typeof value === 'string' && AI_TARGET_KINDS.includes(value as AiTargetKind)
}
