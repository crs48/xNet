/**
 * Tests for the AI surface contract.
 */

import { describe, expect, it } from 'vitest'
import {
  attachAiPlanValidation,
  createAiOperation,
  parseAiMutationPlan,
  serializeAiMutationPlan,
  validateAiMutationPlan,
  type AiMutationPlan
} from '../ai-surface'

function createValidPlan(overrides: Partial<AiMutationPlan> = {}): AiMutationPlan {
  return {
    id: 'plan_1',
    actor: 'test-agent',
    intent: 'Rewrite a page section',
    risk: 'medium',
    requiredScopes: ['page.read', 'page.propose'],
    changes: [
      {
        targetKind: 'page',
        targetId: 'page_1',
        baseRevision: 'updatedAt:1',
        operations: [
          createAiOperation(
            'replaceMarkdown',
            { markdown: '# Updated page' },
            'User asked for a rewrite'
          )
        ]
      }
    ],
    validation: { valid: true, errors: [], warnings: [] },
    createdAt: '2026-06-02T12:00:00.000Z',
    status: 'proposed',
    ...overrides
  }
}

describe('AI surface contract', () => {
  describe('validateAiMutationPlan', () => {
    it('accepts a valid mutation plan', () => {
      const validation = validateAiMutationPlan(createValidPlan())

      expect(validation.valid).toBe(true)
      expect(validation.errors).toEqual([])
    })

    it('rejects unsupported risk levels and scopes', () => {
      const invalid = {
        ...createValidPlan(),
        risk: 'severe',
        requiredScopes: ['page.read', 'page.destroy']
      }

      const validation = validateAiMutationPlan(invalid)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('risk must be one of: low, medium, high, critical')
      expect(validation.errors).toContain('requiredScopes[1] is not a supported AI scope')
    })

    it('requires critical risk for storage recovery scope', () => {
      const validation = validateAiMutationPlan(
        createValidPlan({
          risk: 'high',
          requiredScopes: ['storage.recovery'],
          changes: [
            {
              targetKind: 'storage',
              targetId: 'local',
              baseRevision: 'snapshot:1',
              operations: [createAiOperation('restoreSnapshot', { snapshotId: 'snapshot_1' })]
            }
          ]
        })
      )

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('storage.recovery scope requires critical risk')
    })

    it('warns when low-risk plans request write scopes', () => {
      const validation = validateAiMutationPlan(
        createValidPlan({
          risk: 'low',
          requiredScopes: ['page.write']
        })
      )

      expect(validation.valid).toBe(true)
      expect(validation.warnings).toContain('low-risk plans should not request write scopes')
    })
  })

  describe('serialization', () => {
    it('round-trips a valid mutation plan', () => {
      const plan = createValidPlan()
      const serialized = serializeAiMutationPlan(plan)
      const parsed = parseAiMutationPlan(serialized)

      expect(parsed.validation.valid).toBe(true)
      expect(parsed.plan?.id).toBe(plan.id)
      expect(parsed.plan?.changes[0].operations[0].op).toBe('replaceMarkdown')
    })

    it('returns validation errors for invalid JSON', () => {
      const parsed = parseAiMutationPlan('{not-json')

      expect(parsed.plan).toBeNull()
      expect(parsed.validation.valid).toBe(false)
      expect(parsed.validation.errors[0]).toContain('Invalid mutation plan JSON')
    })
  })

  describe('attachAiPlanValidation', () => {
    it('updates plan status based on validation', () => {
      const plan = attachAiPlanValidation(createValidPlan())

      expect(plan.status).toBe('validated')
      expect(plan.validation.valid).toBe(true)
    })
  })
})
