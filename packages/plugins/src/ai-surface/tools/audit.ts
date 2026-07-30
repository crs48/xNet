/**
 * Audit and plan-validation tools: the AI mutation audit log and standalone
 * mutation-plan validation.
 */

import type { AiToolEntry } from './entry'
import { readOptionalNumber, readOptionalString } from '../args'
import { validateAiMutationPlan } from '../validation'

export const getAuditLogTool: AiToolEntry = {
  definition: {
    name: 'xnet_get_audit_log',
    title: 'Read AI audit log',
    description: 'Read recent AI mutation audit events with optional plan filtering.',
    risk: 'low',
    requiredScopes: ['workspace.read'],
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Optional mutation plan id filter.' },
        limit: { type: 'number', description: 'Maximum audit events to return.' }
      }
    }
  },
  execute: (host, args) =>
    host.getAuditLog({
      planId: readOptionalString(args, 'planId'),
      limit: readOptionalNumber(args, 'limit')
    })
}

export const validateMutationPlanTool: AiToolEntry = {
  definition: {
    name: 'xnet_validate_mutation_plan',
    title: 'Validate mutation plan',
    description: 'Validate a serialized mutation plan and return errors or warnings.',
    risk: 'medium',
    requiredScopes: ['workspace.read'],
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'object', description: 'Mutation plan object to validate.' }
      },
      required: ['plan']
    }
  },
  execute: (_host, args) => {
    const validation = validateAiMutationPlan(args.plan)
    return { validation }
  }
}
