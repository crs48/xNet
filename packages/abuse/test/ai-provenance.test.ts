import { describe, expect, it } from 'vitest'
import {
  createAISignalProvenanceEvidenceRef,
  isAISignalSourceType,
  validateAISignalProvenance
} from '../src/ai-provenance'

describe('AI signal provenance', () => {
  it('does not require model provenance for non-AI sources', () => {
    expect(validateAISignalProvenance({ sourceType: 'deterministic' })).toEqual({
      required: false,
      valid: true,
      errors: [],
      provenance: null
    })
  })

  it('requires provider and model for AI-generated sources', () => {
    expect(validateAISignalProvenance({ sourceType: 'cloud-ai' })).toMatchObject({
      required: true,
      valid: false,
      errors: ['missing-model-provider', 'missing-model-name'],
      provenance: null
    })
  })

  it('normalizes valid AI model/provider provenance', () => {
    expect(
      validateAISignalProvenance({
        sourceType: 'local-ai',
        modelProvider: ' Local Runner ',
        modelName: ' Safety Small ',
        modelVersion: ' 2026-01 '
      })
    ).toEqual({
      required: true,
      valid: true,
      errors: [],
      provenance: {
        sourceType: 'local-ai',
        modelProvider: 'Local Runner',
        modelName: 'Safety Small',
        modelVersion: '2026-01',
        adapterId: undefined,
        adapterVersion: undefined,
        policyId: undefined
      }
    })
  })

  it('creates stable evidence refs for AI provenance', () => {
    expect(
      createAISignalProvenanceEvidenceRef({
        sourceType: 'cloud-ai',
        modelProvider: 'Example AI',
        modelName: 'Safety Small',
        modelVersion: '2026-01'
      })
    ).toBe('ai-provenance:cloud-ai:example-ai:safety-small:2026-01')
  })

  it('narrows AI signal source types', () => {
    expect(isAISignalSourceType('local-ai')).toBe(true)
    expect(isAISignalSourceType('crawler')).toBe(false)
  })
})
