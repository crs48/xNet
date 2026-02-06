/**
 * MigrationWizard - Interactive step-by-step schema migration wizard.
 *
 * Guides users through the migration process:
 * 1. Analyze - Detect schema changes and affected nodes
 * 2. Review - Review changes by risk level (safe/caution/breaking)
 * 3. Generate - Generate and edit lens code
 * 4. Test - Test migration on sample data
 * 5. Apply - Apply migration to the store
 */

import { useState } from 'react'
import {
  useMigrationWizard,
  type WizardStep,
  type MigrationCandidate,
  type RiskLevel
} from './useMigrationWizard'

export function MigrationWizard() {
  const wizard = useMigrationWizard()

  return (
    <div className="flex flex-col h-full">
      {/* Header with progress */}
      <WizardHeader step={wizard.step} />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-3">
        {wizard.step === 'analyze' && (
          <AnalyzeStep
            candidates={wizard.candidates}
            isLoading={wizard.isLoading}
            error={wizard.error}
            onAnalyze={wizard.analyzeSchemas}
          />
        )}
        {wizard.step === 'review' && (
          <ReviewStep
            candidates={wizard.candidates}
            selectedCandidates={wizard.selectedCandidates}
            onSelect={wizard.selectCandidate}
            onSelectAll={wizard.selectAll}
            onSelectNone={wizard.selectNone}
          />
        )}
        {wizard.step === 'generate' && (
          <GenerateStep
            candidates={wizard.candidates}
            selectedCandidates={wizard.selectedCandidates}
            onUpdateCode={wizard.updateLensCode}
          />
        )}
        {wizard.step === 'test' && (
          <TestStep
            candidates={wizard.candidates}
            selectedCandidates={wizard.selectedCandidates}
            isLoading={wizard.isLoading}
          />
        )}
        {wizard.step === 'apply' && (
          <ApplyStep
            candidates={wizard.candidates}
            selectedCandidates={wizard.selectedCandidates}
            isLoading={wizard.isLoading}
          />
        )}
        {wizard.step === 'done' && <DoneStep onReset={wizard.reset} />}
      </div>

      {/* Footer with navigation */}
      <WizardFooter
        step={wizard.step}
        canProceed={wizard.canProceed}
        isLoading={wizard.isLoading}
        summary={wizard.summary}
        onNext={() => {
          switch (wizard.step) {
            case 'analyze':
              wizard.goToStep('review')
              break
            case 'review':
              wizard.generateLenses()
              break
            case 'generate':
              wizard.testMigrations()
              break
            case 'test':
              wizard.applyMigrations()
              break
          }
        }}
        onBack={() => {
          switch (wizard.step) {
            case 'review':
              wizard.goToStep('analyze')
              break
            case 'generate':
              wizard.goToStep('review')
              break
            case 'test':
              wizard.goToStep('generate')
              break
            case 'apply':
              wizard.goToStep('test')
              break
          }
        }}
        _onReset={wizard.reset}
      />
    </div>
  )
}

// ─── Header Component ────────────────────────────────────────────────────────

const STEPS: Array<{ id: WizardStep; label: string; icon: string }> = [
  { id: 'analyze', label: 'Analyze', icon: '1' },
  { id: 'review', label: 'Review', icon: '2' },
  { id: 'generate', label: 'Generate', icon: '3' },
  { id: 'test', label: 'Test', icon: '4' },
  { id: 'apply', label: 'Apply', icon: '5' }
]

function WizardHeader({ step }: { step: WizardStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-zinc-400 mr-2">Migration Wizard</span>
        {STEPS.map((s, i) => {
          const isActive = s.id === step
          const isPast = i < currentIndex
          const isFuture = i > currentIndex

          return (
            <div key={s.id} className="flex items-center">
              <div
                className={`
                  flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold
                  ${isActive ? 'bg-blue-500 text-white' : ''}
                  ${isPast ? 'bg-green-600 text-white' : ''}
                  ${isFuture ? 'bg-zinc-700 text-zinc-400' : ''}
                `}
              >
                {isPast ? 'ok' : s.icon}
              </div>
              <span
                className={`
                  ml-1 text-[10px]
                  ${isActive ? 'text-blue-400' : ''}
                  ${isPast ? 'text-green-400' : ''}
                  ${isFuture ? 'text-zinc-500' : ''}
                `}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-4 h-px mx-2 ${isPast ? 'bg-green-600' : 'bg-zinc-700'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step Components ─────────────────────────────────────────────────────────

function AnalyzeStep({
  candidates,
  isLoading,
  error,
  onAnalyze
}: {
  candidates: MigrationCandidate[]
  isLoading: boolean
  error: string | null
  onAnalyze: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400">
        <div className="animate-pulse text-lg mb-2">Analyzing schemas...</div>
        <div className="text-xs">Scanning nodes and schema versions</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-red-400 mb-2">Error: {error}</div>
        <button
          onClick={onAnalyze}
          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
        >
          Retry
        </button>
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400">
        <div className="text-lg mb-4">Schema Migration Wizard</div>
        <p className="text-xs text-center max-w-md mb-6">
          This wizard helps you migrate data when schemas change. Click "Analyze" to scan your store
          for schemas that need migration.
        </p>
        <button
          onClick={onAnalyze}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
        >
          Analyze Schemas
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Schemas Found</h3>
        <button
          onClick={onAnalyze}
          className="px-2 py-1 text-[10px] bg-zinc-700 hover:bg-zinc-600 rounded"
        >
          Re-analyze
        </button>
      </div>
      <div className="space-y-2">
        {candidates.map((c) => (
          <CandidateRow key={c.schemaIRI} candidate={c} selectable={false} />
        ))}
      </div>
    </div>
  )
}

function ReviewStep({
  candidates,
  selectedCandidates,
  onSelect,
  onSelectAll,
  onSelectNone
}: {
  candidates: MigrationCandidate[]
  selectedCandidates: Set<string>
  onSelect: (iri: string, selected: boolean) => void
  onSelectAll: () => void
  onSelectNone: () => void
}) {
  const byRisk = {
    breaking: candidates.filter((c) => c.diff?.overallRisk === 'breaking'),
    caution: candidates.filter((c) => c.diff?.overallRisk === 'caution'),
    safe: candidates.filter((c) => c.diff?.overallRisk === 'safe' || !c.diff)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Select Schemas to Migrate</h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="px-2 py-1 text-[10px] bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            Select All
          </button>
          <button
            onClick={onSelectNone}
            className="px-2 py-1 text-[10px] bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            Select None
          </button>
        </div>
      </div>

      {byRisk.breaking.length > 0 && (
        <RiskSection
          risk="breaking"
          label="Breaking Changes"
          candidates={byRisk.breaking}
          selectedCandidates={selectedCandidates}
          onSelect={onSelect}
        />
      )}

      {byRisk.caution.length > 0 && (
        <RiskSection
          risk="caution"
          label="Caution"
          candidates={byRisk.caution}
          selectedCandidates={selectedCandidates}
          onSelect={onSelect}
        />
      )}

      {byRisk.safe.length > 0 && (
        <RiskSection
          risk="safe"
          label="Safe Changes"
          candidates={byRisk.safe}
          selectedCandidates={selectedCandidates}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

function GenerateStep({
  candidates,
  selectedCandidates,
  onUpdateCode
}: {
  candidates: MigrationCandidate[]
  selectedCandidates: Set<string>
  onUpdateCode: (iri: string, code: string) => void
}) {
  const selected = candidates.filter((c) => selectedCandidates.has(c.schemaIRI))
  const [activeIRI, setActiveIRI] = useState<string | null>(selected[0]?.schemaIRI ?? null)
  const activeCandidate = candidates.find((c) => c.schemaIRI === activeIRI)

  return (
    <div className="flex h-full gap-3">
      {/* Sidebar */}
      <div className="w-48 shrink-0 space-y-1">
        <div className="text-[10px] text-zinc-500 uppercase font-bold mb-2">Migrations</div>
        {selected.map((c) => (
          <button
            key={c.schemaIRI}
            onClick={() => setActiveIRI(c.schemaIRI)}
            className={`
              w-full text-left px-2 py-1.5 rounded text-xs
              ${activeIRI === c.schemaIRI ? 'bg-blue-600' : 'bg-zinc-800 hover:bg-zinc-700'}
            `}
          >
            <div className="font-medium truncate">{c.schemaName}</div>
            <div className="text-[10px] opacity-60">
              {c.currentVersion} {'->'} {c.targetVersion}
            </div>
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        {activeCandidate ? (
          <>
            <div className="text-xs font-medium mb-2">{activeCandidate.schemaName} Migration</div>
            <textarea
              value={activeCandidate.generatedLens ?? ''}
              onChange={(e) => onUpdateCode(activeCandidate.schemaIRI, e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded p-2 font-mono text-[11px] text-zinc-300 resize-none"
              spellCheck={false}
            />
            <div className="mt-2 text-[10px] text-zinc-500">
              Edit the lens code above if needed. The wizard generated this based on detected
              changes.
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
            Select a migration from the sidebar
          </div>
        )}
      </div>
    </div>
  )
}

function TestStep({
  candidates,
  selectedCandidates,
  isLoading
}: {
  candidates: MigrationCandidate[]
  selectedCandidates: Set<string>
  isLoading: boolean
}) {
  const selected = candidates.filter((c) => selectedCandidates.has(c.schemaIRI))

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400">
        <div className="animate-pulse text-lg mb-2">Testing migrations...</div>
        <div className="text-xs">Running on sample data</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Test Results</h3>
      <div className="space-y-2">
        {selected.map((c) => (
          <div
            key={c.schemaIRI}
            className={`
              p-3 rounded border
              ${c.testResult?.success ? 'border-green-800 bg-green-900/20' : 'border-zinc-700 bg-zinc-900'}
            `}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">{c.schemaName}</div>
              {c.testResult && (
                <span
                  className={`text-xs ${c.testResult.success ? 'text-green-400' : 'text-red-400'}`}
                >
                  {c.testResult.success ? 'PASSED' : 'FAILED'}
                </span>
              )}
            </div>
            {c.testResult && (
              <div className="mt-1 text-[10px] text-zinc-400">
                Tested {c.testResult.samplesRun} samples, {c.testResult.samplesFailed} failed
              </div>
            )}
            {c.testResult?.errors && c.testResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {c.testResult.errors.map((err, i) => (
                  <div key={i} className="text-[10px] text-red-400">
                    {err.nodeId}: {err.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ApplyStep({
  candidates,
  selectedCandidates,
  isLoading
}: {
  candidates: MigrationCandidate[]
  selectedCandidates: Set<string>
  isLoading: boolean
}) {
  const selected = candidates.filter((c) => selectedCandidates.has(c.schemaIRI))

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400">
        <div className="animate-pulse text-lg mb-2">Applying migrations...</div>
        <div className="text-xs">Updating nodes in the store</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Applying Migrations</h3>
      <div className="space-y-2">
        {selected.map((c) => (
          <div key={c.schemaIRI} className="flex items-center gap-3 p-2 bg-zinc-900 rounded">
            <div
              className={`
                w-4 h-4 rounded-full flex items-center justify-center text-[8px]
                ${c.status === 'done' ? 'bg-green-600' : 'bg-zinc-700'}
              `}
            >
              {c.status === 'done' ? 'ok' : '...'}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{c.schemaName}</div>
              <div className="text-[10px] text-zinc-500">{c.nodeCount} nodes</div>
            </div>
            <span className="text-[10px] text-zinc-400">{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DoneStep({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-2xl mb-4">
        ok
      </div>
      <h3 className="text-lg font-medium mb-2">Migration Complete</h3>
      <p className="text-sm text-zinc-400 mb-6">
        All selected schemas have been migrated successfully.
      </p>
      <button onClick={onReset} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">
        Start New Migration
      </button>
    </div>
  )
}

// ─── Helper Components ───────────────────────────────────────────────────────

function RiskSection({
  risk,
  label,
  candidates,
  selectedCandidates,
  onSelect
}: {
  risk: RiskLevel
  label: string
  candidates: MigrationCandidate[]
  selectedCandidates: Set<string>
  onSelect: (iri: string, selected: boolean) => void
}) {
  const colors: Record<RiskLevel, { bg: string; border: string; text: string }> = {
    breaking: { bg: 'bg-red-900/20', border: 'border-red-800', text: 'text-red-400' },
    caution: { bg: 'bg-yellow-900/20', border: 'border-yellow-800', text: 'text-yellow-400' },
    safe: { bg: 'bg-green-900/20', border: 'border-green-800', text: 'text-green-400' }
  }

  return (
    <div className={`rounded border ${colors[risk].border} ${colors[risk].bg} p-3`}>
      <div className={`text-xs font-bold uppercase mb-2 ${colors[risk].text}`}>
        {label} ({candidates.length})
      </div>
      <div className="space-y-2">
        {candidates.map((c) => (
          <CandidateRow
            key={c.schemaIRI}
            candidate={c}
            selectable={true}
            selected={selectedCandidates.has(c.schemaIRI)}
            onSelect={(selected) => onSelect(c.schemaIRI, selected)}
          />
        ))}
      </div>
    </div>
  )
}

function CandidateRow({
  candidate,
  selectable,
  selected,
  onSelect
}: {
  candidate: MigrationCandidate
  selectable: boolean
  selected?: boolean
  onSelect?: (selected: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-zinc-900 rounded overflow-hidden">
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-zinc-800"
        onClick={() => setExpanded(!expanded)}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation()
              onSelect?.(e.target.checked)
            }}
            className="w-3 h-3"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{candidate.schemaName}</div>
          <div className="text-[10px] text-zinc-500">
            {candidate.currentVersion} {'->'} {candidate.targetVersion} | {candidate.nodeCount}{' '}
            nodes
          </div>
        </div>
        <span className="text-[10px] text-zinc-600">{expanded ? '-' : '+'}</span>
      </div>

      {expanded && candidate.diff && (
        <div className="px-2 pb-2 pt-1 border-t border-zinc-800 space-y-1">
          {candidate.diff.changes.map((change, i) => (
            <div key={i} className="text-[10px] flex items-start gap-1">
              <RiskBadge risk={change.risk} />
              <span className="text-zinc-300">{change.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const config: Record<RiskLevel, { bg: string; text: string; label: string }> = {
    breaking: { bg: 'bg-red-800', text: 'text-red-200', label: '!' },
    caution: { bg: 'bg-yellow-800', text: 'text-yellow-200', label: '*' },
    safe: { bg: 'bg-green-800', text: 'text-green-200', label: '+' }
  }

  return (
    <span
      className={`w-3 h-3 flex items-center justify-center rounded ${config[risk].bg} ${config[risk].text} text-[8px] font-bold shrink-0`}
    >
      {config[risk].label}
    </span>
  )
}

// ─── Footer Component ────────────────────────────────────────────────────────

function WizardFooter({
  step,
  canProceed,
  isLoading,
  summary,
  onNext,
  onBack,
  _onReset
}: {
  step: WizardStep
  canProceed: boolean
  isLoading: boolean
  summary: { total: number; selected: number; breaking: number; caution: number; safe: number }
  onNext: () => void
  onBack: () => void
  _onReset: () => void
}) {
  if (step === 'done') return null

  const nextLabel: Record<WizardStep, string> = {
    analyze: 'Continue to Review',
    review: 'Generate Lenses',
    generate: 'Test Migration',
    test: 'Apply Migration',
    apply: 'Applying...',
    done: ''
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800 shrink-0">
      <div className="text-[10px] text-zinc-500">
        {summary.selected > 0 && (
          <span>
            {summary.selected} selected ({summary.breaking} breaking, {summary.caution} caution,{' '}
            {summary.safe} safe)
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {step !== 'analyze' && (
          <button
            onClick={onBack}
            disabled={isLoading}
            className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded disabled:opacity-50"
          >
            Back
          </button>
        )}
        <button
          onClick={step === 'analyze' && summary.total === 0 ? () => {} : onNext}
          disabled={!canProceed || isLoading}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
        >
          {isLoading ? 'Working...' : nextLabel[step]}
        </button>
      </div>
    </div>
  )
}
