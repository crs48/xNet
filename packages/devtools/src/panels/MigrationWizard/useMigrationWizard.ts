/**
 * useMigrationWizard - State management for the schema migration wizard.
 *
 * Manages the multi-step migration flow:
 * 1. Analyze - Detect schema changes
 * 2. Review - Review changes by risk level
 * 3. Generate - Generate lens code
 * 4. Test - Test migration on sample data
 * 5. Apply - Apply to the store
 */

import { schemaRegistry, type Schema, type SchemaIRI } from '@xnetjs/data'
import { useState, useCallback, useMemo } from 'react'
import { useDevTools } from '../../provider/useDevTools'

// ─── Types ───────────────────────────────────────────────────────────────────

export type WizardStep = 'analyze' | 'review' | 'generate' | 'test' | 'apply' | 'done'

export type RiskLevel = 'safe' | 'caution' | 'breaking'

export interface SchemaChange {
  type: 'add' | 'remove' | 'modify' | 'rename'
  property: string
  newProperty?: string
  risk: RiskLevel
  description: string
  suggestedLens?: string
}

export interface SchemaDiffResult {
  fromVersion: string
  toVersion: string
  changes: SchemaChange[]
  overallRisk: RiskLevel
  autoMigratable: boolean
  summary: { safe: number; caution: number; breaking: number }
}

export interface MigrationCandidate {
  schemaIRI: SchemaIRI
  schemaName: string
  currentVersion: string
  targetVersion: string
  nodeCount: number
  diff: SchemaDiffResult | null
  status:
    | 'pending'
    | 'analyzing'
    | 'ready'
    | 'generating'
    | 'testing'
    | 'applying'
    | 'done'
    | 'error'
  error?: string
  generatedLens?: string
  testResult?: TestResult
}

export interface TestResult {
  success: boolean
  samplesRun: number
  samplesFailed: number
  errors: Array<{ nodeId: string; error: string }>
}

export interface WizardState {
  step: WizardStep
  candidates: MigrationCandidate[]
  selectedCandidates: Set<string>
  isLoading: boolean
  error: string | null
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function getDefaultValue(type: string): string {
  switch (type) {
    case 'text':
      return "''"
    case 'number':
      return '0'
    case 'checkbox':
      return 'false'
    case 'date':
      return 'null'
    case 'select':
      return 'null'
    case 'multiSelect':
      return '[]'
    case 'person':
      return '[]'
    case 'relation':
      return '[]'
    case 'url':
      return 'null'
    case 'email':
      return 'null'
    case 'phone':
      return 'null'
    case 'file':
      return '[]'
    default:
      return 'null'
  }
}

export function diffSchemas(oldSchema: Schema, newSchema: Schema): SchemaDiffResult {
  const changes: SchemaChange[] = []
  const oldProps = new Map(oldSchema.properties.map((p) => [p.name, p]))
  const newProps = new Map(newSchema.properties.map((p) => [p.name, p]))

  // Find removed properties
  for (const [name, def] of oldProps) {
    if (!newProps.has(name)) {
      changes.push({
        type: 'remove',
        property: name,
        risk: 'caution',
        description: `Removed property "${name}" (${def.type})`,
        suggestedLens: `remove('${name}')`
      })
    }
  }

  // Find added properties
  for (const [name, def] of newProps) {
    if (!oldProps.has(name)) {
      const isRequired = def.required === true
      changes.push({
        type: 'add',
        property: name,
        risk: isRequired ? 'caution' : 'safe',
        description: isRequired
          ? `Added required property "${name}" (${def.type})`
          : `Added optional property "${name}" (${def.type})`,
        suggestedLens: isRequired
          ? `addDefault('${name}', ${getDefaultValue(def.type)})`
          : undefined
      })
    }
  }

  // Find modified properties
  for (const [name, oldDef] of oldProps) {
    const newDef = newProps.get(name)
    if (!newDef) continue

    if (oldDef.type !== newDef.type) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'breaking',
        description: `Changed type of "${name}" from ${oldDef.type} to ${newDef.type}`,
        suggestedLens: `transform('${name}', (v) => /* TODO: convert ${oldDef.type} to ${newDef.type} */, (v) => /* reverse */)`
      })
    }

    if (!oldDef.required && newDef.required) {
      changes.push({
        type: 'modify',
        property: name,
        risk: 'caution',
        description: `Made "${name}" required`,
        suggestedLens: `addDefault('${name}', ${getDefaultValue(newDef.type)})`
      })
    }
  }

  const summary = {
    safe: changes.filter((c) => c.risk === 'safe').length,
    caution: changes.filter((c) => c.risk === 'caution').length,
    breaking: changes.filter((c) => c.risk === 'breaking').length
  }

  const overallRisk: RiskLevel =
    summary.breaking > 0 ? 'breaking' : summary.caution > 0 ? 'caution' : 'safe'

  const autoMigratable = changes
    .filter((c) => c.risk !== 'safe')
    .every((c) => c.suggestedLens && !c.suggestedLens.includes('TODO'))

  return {
    fromVersion: oldSchema.version,
    toVersion: newSchema.version,
    changes,
    overallRisk,
    autoMigratable,
    summary
  }
}

function generateLensCode(candidate: MigrationCandidate): string {
  if (!candidate.diff) return '// No changes detected'

  const operations = candidate.diff.changes
    .filter((c) => c.suggestedLens && c.risk !== 'safe')
    .map((c) => `  ${c.suggestedLens}`)

  if (operations.length === 0) {
    return `// No migration needed - all changes are safe (additive)\nidentity('${candidate.schemaIRI}@${candidate.currentVersion}', '${candidate.schemaIRI}@${candidate.targetVersion}')`
  }

  return `import { composeLens, rename, convert, addDefault, remove, transform } from '@xnetjs/data'

const ${candidate.schemaName.replace(/\s/g, '')}Migration = composeLens(
  '${candidate.schemaIRI}@${candidate.currentVersion}',
  '${candidate.schemaIRI}@${candidate.targetVersion}',
${operations.join(',\n')}
)

export { ${candidate.schemaName.replace(/\s/g, '')}Migration }`
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMigrationWizard() {
  const { store } = useDevTools()

  const [state, setState] = useState<WizardState>({
    step: 'analyze',
    candidates: [],
    selectedCandidates: new Set(),
    isLoading: false,
    error: null
  })

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const analyzeSchemas = useCallback(async () => {
    if (!store) {
      setState((s) => ({ ...s, error: 'No store connected' }))
      return
    }

    setState((s) => ({ ...s, isLoading: true, error: null }))

    try {
      // Get all nodes to find used schemas
      const nodes = await store.list()
      const nodeCounts = new Map<string, number>()

      for (const node of nodes) {
        nodeCounts.set(node.schemaId, (nodeCounts.get(node.schemaId) || 0) + 1)
      }

      // Get all schema IRIs and check for version differences
      const candidates: MigrationCandidate[] = []
      const schemaIRIs = schemaRegistry.getAllIRIs()

      for (const iri of schemaIRIs) {
        try {
          const registration = await schemaRegistry.get(iri as SchemaIRI)
          if (!registration) continue

          // Check for nodes using older versions
          // (In a real implementation, this would check the actual stored node versions)
          const nodeCount = nodeCounts.get(iri) || 0

          // For demo, we just show schemas that have nodes
          if (nodeCount > 0) {
            candidates.push({
              schemaIRI: iri as SchemaIRI,
              schemaName: registration.schema.name,
              currentVersion: registration.schema.version,
              targetVersion: registration.schema.version, // Same for now
              nodeCount,
              diff: null,
              status: 'pending'
            })
          }
        } catch (err) {
          console.warn(`Failed to load schema ${iri}:`, err)
        }
      }

      setState((s) => ({
        ...s,
        candidates,
        isLoading: false,
        step: candidates.length > 0 ? 'analyze' : 'analyze'
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Analysis failed'
      }))
    }
  }, [store])

  const selectCandidate = useCallback((schemaIRI: string, selected: boolean) => {
    setState((s) => {
      const newSelected = new Set(s.selectedCandidates)
      if (selected) {
        newSelected.add(schemaIRI)
      } else {
        newSelected.delete(schemaIRI)
      }
      return { ...s, selectedCandidates: newSelected }
    })
  }, [])

  const selectAll = useCallback(() => {
    setState((s) => ({
      ...s,
      selectedCandidates: new Set(s.candidates.map((c) => c.schemaIRI))
    }))
  }, [])

  const selectNone = useCallback(() => {
    setState((s) => ({ ...s, selectedCandidates: new Set() }))
  }, [])

  const goToStep = useCallback((step: WizardStep) => {
    setState((s) => ({ ...s, step }))
  }, [])

  const generateLenses = useCallback(() => {
    setState((s) => {
      const updatedCandidates = s.candidates.map((c) => {
        if (!s.selectedCandidates.has(c.schemaIRI)) return c
        return {
          ...c,
          status: 'ready' as const,
          generatedLens: generateLensCode(c)
        }
      })
      return { ...s, candidates: updatedCandidates, step: 'generate' as const }
    })
  }, [])

  const testMigrations = useCallback(async () => {
    if (!store) return

    setState((s) => ({ ...s, step: 'test', isLoading: true }))

    // Simulate testing migrations
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setState((s) => {
      const updatedCandidates = s.candidates.map((c) => {
        if (!s.selectedCandidates.has(c.schemaIRI)) return c
        return {
          ...c,
          status: 'testing' as const,
          testResult: {
            success: true,
            samplesRun: Math.min(c.nodeCount, 10),
            samplesFailed: 0,
            errors: []
          }
        }
      })
      return { ...s, candidates: updatedCandidates, isLoading: false }
    })
  }, [store])

  const applyMigrations = useCallback(async () => {
    if (!store) return

    setState((s) => ({ ...s, step: 'apply', isLoading: true }))

    // Simulate applying migrations
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setState((s) => {
      const updatedCandidates = s.candidates.map((c) => {
        if (!s.selectedCandidates.has(c.schemaIRI)) return c
        return { ...c, status: 'done' as const }
      })
      return { ...s, candidates: updatedCandidates, isLoading: false, step: 'done' }
    })
  }, [store])

  const reset = useCallback(() => {
    setState({
      step: 'analyze',
      candidates: [],
      selectedCandidates: new Set(),
      isLoading: false,
      error: null
    })
  }, [])

  const updateLensCode = useCallback((schemaIRI: string, code: string) => {
    setState((s) => ({
      ...s,
      candidates: s.candidates.map((c) =>
        c.schemaIRI === schemaIRI ? { ...c, generatedLens: code } : c
      )
    }))
  }, [])

  // ─── Derived State ───────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const selected = state.candidates.filter((c) => state.selectedCandidates.has(c.schemaIRI))
    return {
      total: state.candidates.length,
      selected: selected.length,
      breaking: selected.filter((c) => c.diff?.overallRisk === 'breaking').length,
      caution: selected.filter((c) => c.diff?.overallRisk === 'caution').length,
      safe: selected.filter((c) => c.diff?.overallRisk === 'safe').length,
      autoMigratable: selected.filter((c) => c.diff?.autoMigratable).length
    }
  }, [state.candidates, state.selectedCandidates])

  const canProceed = useMemo(() => {
    switch (state.step) {
      case 'analyze':
        return state.candidates.length > 0
      case 'review':
        return state.selectedCandidates.size > 0
      case 'generate':
        return state.candidates.some(
          (c) => state.selectedCandidates.has(c.schemaIRI) && c.generatedLens
        )
      case 'test':
        return state.candidates.every(
          (c) => !state.selectedCandidates.has(c.schemaIRI) || c.testResult?.success
        )
      case 'apply':
        return true
      default:
        return false
    }
  }, [state])

  return {
    // State
    step: state.step,
    candidates: state.candidates,
    selectedCandidates: state.selectedCandidates,
    isLoading: state.isLoading,
    error: state.error,
    summary,
    canProceed,

    // Actions
    analyzeSchemas,
    selectCandidate,
    selectAll,
    selectNone,
    goToStep,
    generateLenses,
    testMigrations,
    applyMigrations,
    reset,
    updateLensCode
  }
}
