/**
 * ChapterList — editable chapter markers with click-to-seek (exploration 0414).
 *
 * Titles arrive from the model already screened for groundedness, but the user
 * has the last word: every title is editable inline and any chapter can be
 * removed. The model proposes; the person decides.
 */

import type { Chapter, Cut } from '@xnetjs/data'
import { formatClock, sourceToEdited } from '@xnetjs/recordings'
import { Sparkles, Trash2 } from 'lucide-react'
import { useState, type JSX } from 'react'

export interface ChapterListProps {
  chapters: Chapter[]
  cuts?: Cut[]
  onChange: (chapters: Chapter[]) => void
  onSeek?: (sourceMs: number) => void
  /** Ask the model for chapters; absent while no transcript exists. */
  onGenerate?: () => void
  generating?: boolean
  className?: string
}

export function ChapterList({
  chapters,
  cuts = [],
  onChange,
  onSeek,
  onGenerate,
  generating = false,
  className
}: ChapterListProps): JSX.Element {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const rename = (index: number, title: string): void => {
    onChange(chapters.map((chapter, i) => (i === index ? { ...chapter, title } : chapter)))
  }

  const remove = (index: number): void => {
    onChange(chapters.filter((_, i) => i !== index))
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-sm font-medium">Chapters</h3>
        {onGenerate ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {generating ? 'Generating…' : chapters.length ? 'Regenerate' : 'Generate'}
          </button>
        ) : null}
      </div>

      {chapters.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          {onGenerate
            ? 'No chapters yet.'
            : 'Transcribe this recording first — chapters are built from what was said.'}
        </p>
      ) : (
        <ul className="divide-y">
          {chapters.map((chapter, index) => {
            // A chapter whose start was cut away no longer has a place to land.
            const position = sourceToEdited(chapter.startMs, cuts)
            return (
              <li key={`${chapter.startMs}-${index}`} className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={() => onSeek?.(chapter.startMs)}
                  className="w-12 shrink-0 text-left tabular-nums text-xs text-muted-foreground hover:underline"
                >
                  {formatClock(position.editedMs)}
                </button>

                {editingIndex === index ? (
                  <input
                    autoFocus
                    value={chapter.title}
                    onChange={(event) => rename(index, event.target.value)}
                    onBlur={() => setEditingIndex(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') setEditingIndex(null)
                    }}
                    className="flex-1 rounded border px-1 py-0.5 text-sm"
                    aria-label="Chapter title"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(index)}
                    className={`flex-1 text-left text-sm hover:underline ${
                      position.isCut ? 'text-muted-foreground line-through' : ''
                    }`}
                    title={position.isCut ? 'This chapter starts inside a cut' : undefined}
                  >
                    {chapter.title}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove chapter ${chapter.title}`}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
