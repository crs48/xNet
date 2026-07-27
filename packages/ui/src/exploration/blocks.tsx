/**
 * Document blocks for visual explorations (exploration 0403).
 *
 * These mirror the vocabulary a markdown exploration already uses — callouts,
 * file trees, annotated code, columns, checklists, open questions — so an MDX
 * exploration reads like a `.md` one and a reader moving between them is not
 * relearning a format.
 *
 * The split that keeps these honest (0403): the MDX page carries what only
 * pixels can say; the canonical `.md` carries every decision, risk and
 * checklist. Neither restates the other.
 */
import React from 'react'

/** Matches the GitHub alert vocabulary the `.md` explorations use. */
export type CalloutTone = 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'decision'

const TONE: Record<CalloutTone, { label: string; color: string }> = {
  note: { label: 'Note', color: 'var(--ink-2)' },
  tip: { label: 'Tip', color: 'var(--success)' },
  important: { label: 'Important', color: 'var(--accent-ink)' },
  warning: { label: 'Warning', color: 'var(--warning)' },
  caution: { label: 'Caution', color: 'var(--destructive)' },
  decision: { label: 'Decision', color: 'var(--accent-ink)' }
}

export function Callout({
  tone = 'note',
  children
}: {
  tone?: CalloutTone
  children?: React.ReactNode
}): React.ReactElement {
  const { label, color } = TONE[tone]

  return (
    <div
      style={{
        margin: '16px 0',
        padding: '10px 14px',
        borderLeft: `3px solid hsl(${color})`,
        borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        background: 'hsl(var(--island-b))'
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: `hsl(${color})`,
          marginBottom: '4px'
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '14px' }}>{children}</div>
    </div>
  )
}

export interface FileTreeEntry {
  path: string
  note?: string
  /** Marks a file the change adds or modifies. */
  changed?: boolean
}

export function FileTree({ entries }: { entries: FileTreeEntry[] }): React.ReactElement {
  return (
    <div
      style={{
        margin: '16px 0',
        border: '1px solid hsl(var(--hairline))',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        fontSize: '12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
      }}
    >
      {entries.map((entry) => (
        <div
          key={entry.path}
          style={{
            display: 'flex',
            gap: '12px',
            padding: '6px 12px',
            borderTop: '1px solid hsl(var(--border-muted))',
            background: entry.changed ? 'hsl(var(--accent))' : 'transparent'
          }}
        >
          <span style={{ flex: '1 1 auto' }}>{entry.path}</span>
          {entry.note ? (
            <span style={{ flex: 'none', color: 'hsl(var(--ink-2))' }}>{entry.note}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export interface CodeAnnotation {
  /** `"12"` or `"12-18"`. */
  lines: string
  note: string
}

/**
 * Annotated code — the file map. Carry the real code AND anchor short margin
 * notes to the lines that actually change, so a reader sees what matters
 * instead of code for code's sake. A few high-signal notes per file, never one
 * per line.
 */
export function AnnotatedCode({
  code,
  annotations = [],
  filename
}: {
  code: string
  annotations?: CodeAnnotation[]
  filename?: string
}): React.ReactElement {
  const lines = code.replace(/\n$/, '').split('\n')
  const noteFor = new Map<number, string>()
  for (const { lines: range, note } of annotations) {
    const start = Number(range.split('-')[0])
    if (Number.isFinite(start)) noteFor.set(start, note)
  }

  return (
    <div
      style={{
        margin: '16px 0',
        border: '1px solid hsl(var(--hairline))',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden'
      }}
    >
      {filename ? (
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid hsl(var(--hairline))',
            background: 'hsl(var(--island-b))',
            fontSize: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
          }}
        >
          {filename}
        </div>
      ) : null}
      <div style={{ overflowX: 'auto' }}>
        {lines.map((line, i) => {
          const note = noteFor.get(i + 1)

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '1px 12px',
                background: note ? 'hsl(var(--accent))' : 'transparent',
                fontSize: '12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                whiteSpace: 'pre'
              }}
            >
              <span
                style={{
                  flex: 'none',
                  width: '2.5em',
                  textAlign: 'right',
                  color: 'hsl(var(--ink-3))'
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: '1 1 auto' }}>{line || ' '}</span>
              {note ? (
                <span style={{ flex: 'none', color: 'hsl(var(--ink-2))', whiteSpace: 'normal' }}>
                  ← {note}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Side-by-side comparison — two real options weighed, not decoration. */
export function Columns({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        margin: '16px 0'
      }}
    >
      {children}
    </div>
  )
}

export function Column({
  title,
  children
}: {
  title?: string
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div
      style={{
        padding: '12px',
        border: '1px solid hsl(var(--hairline))',
        borderRadius: 'var(--radius-md)'
      }}
    >
      {title ? <div style={{ fontWeight: 600, marginBottom: '6px' }}>{title}</div> : null}
      <div style={{ fontSize: '14px' }}>{children}</div>
    </div>
  )
}

export interface ChecklistItem {
  label: string
  done?: boolean
}

/**
 * A read-only mirror of checklist state. The canonical checklist lives in the
 * `.md` exploration and is flipped by `/implement`'s driver — this never becomes
 * a second source of truth for what shipped.
 */
export function Checklist({ items }: { items: ChecklistItem[] }): React.ReactElement {
  const done = items.filter((i) => i.done).length

  return (
    <div style={{ margin: '16px 0' }}>
      <div style={{ fontSize: '12px', color: 'hsl(var(--ink-2))', marginBottom: '6px' }}>
        {done}/{items.length} complete — canonical state lives in the exploration
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li key={item.label} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
            <span
              style={{
                flex: 'none',
                color: item.done ? 'hsl(var(--success))' : 'hsl(var(--ink-3))'
              }}
            >
              {item.done ? '☑' : '☐'}
            </span>
            <span style={{ color: item.done ? 'hsl(var(--ink-2))' : 'inherit' }}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Unresolved decisions, gathered in one place at the bottom of a page. */
export function OpenQuestions({ questions }: { questions: string[] }): React.ReactElement {
  return (
    <div
      style={{
        margin: '24px 0 0',
        padding: '12px 16px',
        border: '1px dashed hsl(var(--border-emphasis))',
        borderRadius: 'var(--radius-md)'
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '6px' }}>Open questions</div>
      <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
        {questions.map((q) => (
          <li key={q} style={{ padding: '2px 0' }}>
            {q}
          </li>
        ))}
      </ol>
    </div>
  )
}
