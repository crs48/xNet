import type { ExtensionRevision } from './extension-versions'
import { CodeDiffViewer } from '@xnetjs/ui'
import { ArrowLeft } from 'lucide-react'
import { useRef, useEffect, useState } from 'react'
import { extensionBranches, extensionComparisonBase, revisionKey } from './extension-versions'
import { inputClass, secondaryButton } from './primitives'

export function ExtensionVersionDiff({
  revision,
  history,
  nameFor,
  onBack
}: {
  revision: ExtensionRevision
  history: ExtensionRevision[]
  nameFor: (did: string) => string
  onBack: () => void
}) {
  const [target, setTarget] = useState(revision)
  const [baseKey, setBaseKey] = useState('parent')
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    back.current?.focus()
  }, [])
  const versions = extensionBranches([target, ...history]).map(({ entry }) => entry)
  const parent = extensionComparisonBase(target, history)
  const base =
    baseKey === 'parent'
      ? parent.kind === 'parent'
        ? parent.revision
        : null
      : versions.find((entry) => revisionKey(entry) === baseKey)
  const missing = baseKey === 'parent' ? parent.kind === 'missing' : !base
  const label = (entry: ExtensionRevision) =>
    `${revisionKey(entry).slice(0, 8)} · ${entry.title} · ${entry.lineage?.changeNote ?? 'Earlier local build'}`
  const description = (entry: ExtensionRevision) =>
    `${entry.lineage ? nameFor(entry.lineage.author) : 'You'} · ${new Date(entry.createdAt).toLocaleString()}`

  return (
    <section
      aria-label="Compare extension versions"
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <button ref={back} className={secondaryButton} onClick={onBack}>
          <ArrowLeft size={14} /> Back to extension
        </button>
        <span className="text-xs text-muted-foreground">Code changes</span>
      </div>
      <div className="grid gap-3 rounded-xl bg-muted/40 p-3 text-xs">
        <label className="min-w-0">
          From
          <select
            aria-label="From version"
            className={inputClass}
            value={baseKey}
            onChange={(event) => setBaseKey(event.target.value)}
          >
            <option value="parent">
              {parent.kind === 'initial'
                ? 'Initial version (empty file)'
                : parent.kind === 'parent'
                  ? `Parent · ${label(parent.revision)}`
                  : 'Parent unavailable on this device'}
            </option>
            <optgroup label="Saved versions">
              {versions.map((entry) => (
                <option key={revisionKey(entry)} value={revisionKey(entry)}>
                  {label(entry)}
                </option>
              ))}
            </optgroup>
          </select>
          {base && (
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {description(base)}
            </span>
          )}
        </label>
        <label className="min-w-0">
          To
          <select
            aria-label="To version"
            className={inputClass}
            value={revisionKey(target)}
            onChange={(event) => {
              const next = versions.find((entry) => revisionKey(entry) === event.target.value)
              if (next) setTarget(next)
            }}
          >
            {versions.map((entry) => (
              <option key={revisionKey(entry)} value={revisionKey(entry)}>
                {label(entry)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] text-muted-foreground">
            {description(target)}
          </span>
        </label>
      </div>
      {missing ? (
        <p role="status" className="rounded-xl border border-border p-4 text-sm leading-6">
          {parent.kind === 'missing' && baseKey === 'parent'
            ? `Parent version ${parent.key.slice(0, 8)} is not saved on this device.`
            : 'The selected version is no longer available.'}{' '}
          Choose another saved version above to compare.
        </p>
      ) : (
        <CodeDiffViewer
          before={base?.source ?? ''}
          after={target.source}
          className="min-h-[160px] flex-1"
        />
      )}
    </section>
  )
}
