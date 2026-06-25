/**
 * Seed panel — drives the idempotent two-tier database seed (`../../seed`).
 *
 * "Seed everything" populates a demo workspace covering every content type and
 * the relationships between them. Re-running converges (no duplicates); the mode
 * selector exposes accrete (volume growth) and reseed (clean rebuild). Per-domain
 * toggles and a scale knob tune what's created.
 */

import { useMemo, useState } from 'react'
import { runSeed, SEEDERS, type SeedMode, type SeedProgress, type SeedReport, type SeedScale } from '../../seed'
import { useDevTools } from '../../provider/useDevTools'

const MODES: Array<{ id: SeedMode; label: string; hint: string }> = [
  { id: 'converge', label: 'Converge', hint: 'Fill in what is missing — idempotent, no duplicates.' },
  { id: 'accrete', label: 'Accrete', hint: 'Append extra random-id volume nodes each run.' },
  { id: 'reseed', label: 'Reseed', hint: 'Clear the managed set, then rebuild clean.' }
]

const SCALES: Array<{ id: SeedScale; label: string }> = [
  { id: 'small', label: 'S' },
  { id: 'medium', label: 'M' },
  { id: 'large', label: 'L' }
]

export function Seed() {
  const { store, yDocRegistry, documentHistory } = useDevTools()
  const [mode, setMode] = useState<SeedMode>('converge')
  const [scale, setScale] = useState<SeedScale>('medium')
  const [disabledDomains, setDisabledDomains] = useState<Set<string>>(new Set())
  const [includeAuto, setIncludeAuto] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [report, setReport] = useState<SeedReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const domains = useMemo(() => SEEDERS.map((s) => ({ domain: s.domain, label: s.label })), [])

  const toggleDomain = (domain: string) => {
    setDisabledDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  const run = async () => {
    if (!store) {
      setError('Store not connected.')
      return
    }
    setRunning(true)
    setError(null)
    setReport(null)
    setProgress('Starting…')
    try {
      const selected = domains.map((d) => d.domain).filter((d) => !disabledDomains.has(d))
      const result = await runSeed({
        store,
        mode,
        scale,
        domains: selected,
        includeAuto,
        yDocRegistry,
        documentHistory: documentHistory ?? null,
        onProgress: (p: SeedProgress) => setProgress(p.message)
      })
      setReport(result)
      setProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProgress(null)
    } finally {
      setRunning(false)
    }
  }

  const topSchemas = report
    ? Object.entries(report.perSchema)
        .map(([iri, t]) => ({ name: iri.split('/').pop()?.replace(/@.*/, '') ?? iri, ...t }))
        .filter((r) => r.created + r.updated > 0)
        .sort((a, b) => b.created + b.updated - (a.created + a.updated))
        .slice(0, 12)
    : []

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      <div className="text-xs text-ink-2">
        Populate a demo workspace covering every content type — projects, tasks, pages, canvases,
        dashboards, channels, comments, metrics and more — plus the relationships between them.
        Re-running converges, so it never creates duplicates.
      </div>

      {/* Mode */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wide text-ink-3">Mode</div>
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              title={m.hint}
              className={`rounded px-2 py-1 text-xs ${
                mode === m.id ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-ink-2 hover:bg-surface-3'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-ink-3">{MODES.find((m) => m.id === mode)?.hint}</div>
      </div>

      {/* Scale */}
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-wide text-ink-3">Scale</div>
        <div className="flex gap-1">
          {SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScale(s.id)}
              className={`rounded px-2 py-1 text-xs ${
                scale === s.id ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-ink-2 hover:bg-surface-3'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Domains */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wide text-ink-3">Domains</div>
        <div className="flex flex-wrap gap-2">
          {domains.map((d) => {
            const on = !disabledDomains.has(d.domain)
            return (
              <button
                key={d.domain}
                type="button"
                onClick={() => toggleDomain(d.domain)}
                className={`rounded border px-2 py-1 text-xs ${
                  on
                    ? 'border-primary/40 bg-primary/10 text-ink-1'
                    : 'border-hairline bg-surface-1 text-ink-3'
                }`}
              >
                {on ? '✓ ' : ''}
                {d.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setIncludeAuto((v) => !v)}
            title="Create one representative node for every other registered schema."
            className={`rounded border px-2 py-1 text-xs ${
              includeAuto
                ? 'border-primary/40 bg-primary/10 text-ink-1'
                : 'border-hairline bg-surface-1 text-ink-3'
            }`}
          >
            {includeAuto ? '✓ ' : ''}Auto-coverage
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={!store || running}
          className={`rounded px-4 py-2 text-xs font-medium ${
            store && !running
              ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
              : 'bg-background-emphasis text-ink-3 cursor-not-allowed'
          }`}
        >
          {running ? 'Seeding…' : 'Seed everything'}
        </button>
        {progress && <span className="text-xs text-ink-3">{progress}</span>}
      </div>

      {!store && <div className="text-xs text-warning">Store not connected. Seeding disabled.</div>}

      {error && (
        <div className="rounded bg-destructive-muted p-2 text-xs text-destructive">{error}</div>
      )}

      {report && (
        <div className="rounded border border-hairline bg-surface-1 p-2 text-xs text-ink-2">
          <div className="mb-1 font-medium text-ink-1">
            {report.mode} · scale {report.scale} · {report.created} created · {report.updated} updated
            {report.docsApplied > 0 ? ` · ${report.docsApplied} docs` : ''} ·{' '}
            {Math.round(report.durationMs)}ms
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            {topSchemas.map((r) => (
              <div key={r.name} className="flex justify-between">
                <span className="text-ink-3">{r.name}</span>
                <span>
                  {r.created > 0 && <span className="text-success">+{r.created}</span>}
                  {r.updated > 0 && <span className="text-ink-3"> ~{r.updated}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
