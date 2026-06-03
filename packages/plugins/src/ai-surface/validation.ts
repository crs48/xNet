/**
 * Validation helpers for AI surface mutation plans.
 */

import {
  isAiRiskLevel,
  isAiScope,
  isAiTargetKind,
  type AiChangeSet,
  type AiMutationPlan,
  type AiOperation,
  type AiValidationResult
} from './types'

// ─── Public Validator Contract ──────────────────────────────────────────────

export type AiValidator<TInput = unknown> = (input: TInput) => AiValidationResult

export function createAiValidationResult(
  errors: string[] = [],
  warnings: string[] = []
): AiValidationResult {
  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate a serialized mutation plan before it can be previewed or applied.
 */
export function validateAiMutationPlan(plan: unknown): AiValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isRecord(plan)) {
    return createAiValidationResult(['Plan must be an object'])
  }

  requireString(plan, 'id', errors)
  requireString(plan, 'actor', errors)
  requireString(plan, 'intent', errors)
  requireString(plan, 'createdAt', errors)

  if (!isAiRiskLevel(plan.risk)) {
    errors.push('risk must be one of: low, medium, high, critical')
  }

  if (!Array.isArray(plan.requiredScopes)) {
    errors.push('requiredScopes must be an array')
  } else {
    for (const [index, scope] of plan.requiredScopes.entries()) {
      if (!isAiScope(scope)) {
        errors.push(`requiredScopes[${index}] is not a supported AI scope`)
      }
    }
  }

  if (!Array.isArray(plan.changes) || plan.changes.length === 0) {
    errors.push('changes must contain at least one change set')
  } else {
    plan.changes.forEach((change, index) => validateChangeSet(change, index, errors, warnings))
  }

  if (plan.risk !== 'critical' && hasScope(plan, 'storage.recovery')) {
    errors.push('storage.recovery scope requires critical risk')
  }

  if (plan.risk === 'low' && hasWriteScope(plan)) {
    warnings.push('low-risk plans should not request write scopes')
  }

  return createAiValidationResult(errors, warnings)
}

/**
 * Return a copy of a plan with the latest validation result attached.
 */
export function attachAiPlanValidation(plan: AiMutationPlan): AiMutationPlan {
  const validation = validateAiMutationPlan(plan)
  return {
    ...plan,
    status: validation.valid ? 'validated' : 'proposed',
    validation
  }
}

// ─── Change Set Validation ──────────────────────────────────────────────────

function validateChangeSet(
  change: unknown,
  index: number,
  errors: string[],
  warnings: string[]
): void {
  const path = `changes[${index}]`

  if (!isRecord(change)) {
    errors.push(`${path} must be an object`)
    return
  }

  if (!isAiTargetKind(change.targetKind)) {
    errors.push(`${path}.targetKind is not a supported AI target kind`)
  }

  requireString(change, 'targetId', errors, `${path}.targetId`)
  requireString(change, 'baseRevision', errors, `${path}.baseRevision`)

  if (!Array.isArray(change.operations) || change.operations.length === 0) {
    errors.push(`${path}.operations must contain at least one operation`)
    return
  }

  change.operations.forEach((operation, operationIndex) =>
    validateOperation(operation, `${path}.operations[${operationIndex}]`, errors, warnings)
  )
}

function validateOperation(
  operation: unknown,
  path: string,
  errors: string[],
  warnings: string[]
): void {
  if (!isRecord(operation)) {
    errors.push(`${path} must be an object`)
    return
  }

  requireString(operation, 'op', errors, `${path}.op`)

  if (!isRecord(operation.args)) {
    errors.push(`${path}.args must be an object`)
  }

  if ('rationale' in operation && typeof operation.rationale !== 'string') {
    warnings.push(`${path}.rationale should be a string when present`)
  }
}

// ─── Serialization Helpers ─────────────────────────────────────────────────

export function serializeAiMutationPlan(plan: AiMutationPlan): string {
  return JSON.stringify(plan, null, 2)
}

export function parseAiMutationPlan(serialized: string): {
  plan: AiMutationPlan | null
  validation: AiValidationResult
} {
  try {
    const parsed = JSON.parse(serialized) as unknown
    const validation = validateAiMutationPlan(parsed)
    return {
      plan: validation.valid ? (parsed as AiMutationPlan) : null,
      validation
    }
  } catch (err) {
    return {
      plan: null,
      validation: createAiValidationResult([
        err instanceof Error
          ? `Invalid mutation plan JSON: ${err.message}`
          : 'Invalid mutation plan JSON'
      ])
    }
  }
}

export function createAiOperation<TArgs extends Record<string, unknown>>(
  op: string,
  args: TArgs,
  rationale?: string
): AiOperation<TArgs> {
  return {
    op,
    args,
    ...(rationale ? { rationale } : {})
  }
}

export function createAiChangeSet(input: AiChangeSet): AiChangeSet {
  return {
    targetKind: input.targetKind,
    targetId: input.targetId,
    baseRevision: input.baseRevision,
    operations: input.operations
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  path = key
): void {
  if (typeof record[key] !== 'string' || record[key] === '') {
    errors.push(`${path} must be a non-empty string`)
  }
}

function hasScope(plan: Record<string, unknown>, scope: string): boolean {
  return Array.isArray(plan.requiredScopes) && plan.requiredScopes.includes(scope)
}

function hasWriteScope(plan: Record<string, unknown>): boolean {
  if (!Array.isArray(plan.requiredScopes)) return false
  return plan.requiredScopes.some(
    (scope) => typeof scope === 'string' && (scope.includes('.write') || scope.endsWith('.import'))
  )
}
