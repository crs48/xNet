/**
 * TranscriptTimeline — the transcript IS the timeline (exploration 0414).
 *
 * Descript's contribution to video editing was noticing that people know what
 * they said, not where the waveform dips. Clicking a word seeks; selecting a
 * span cuts it. Both operate on SOURCE offsets, so the mapping stays valid as
 * the cut list changes underneath.
 *
 * Words already inside an enabled cut are struck through rather than hidden —
 * removed text a user cannot see is text they cannot restore.
 */

import type { Cut, RecordingSegment } from '@xnetjs/data'
import { addManualCut, cutAt } from '@xnetjs/recordings'
import { Scissors } from 'lucide-react'
import { useCallback, useState, type JSX } from 'react'

export interface TranscriptTimelineProps {
  segments: RecordingSegment[]
  cuts: Cut[]
  onChange: (cuts: Cut[]) => void
  /** Seek the player to a source offset. */
  onSeek?: (sourceMs: number) => void
  /** Current playhead in source ms, for highlighting. */
  sourceMs?: number
  className?: string
}

interface WordRef {
  segmentIndex: number
  wordIndex: number
  startMs: number
  endMs: number
  text: string
}

/** Flatten to a word list, falling back to whole segments without timings. */
export function flattenWords(segments: RecordingSegment[]): WordRef[] {
  const words: WordRef[] = []
  segments.forEach((segment, segmentIndex) => {
    if (segment.words?.length) {
      segment.words.forEach((word, wordIndex) => {
        words.push({
          segmentIndex,
          wordIndex,
          startMs: word.startMs,
          endMs: word.endMs,
          text: word.text
        })
      })
      return
    }
    words.push({
      segmentIndex,
      wordIndex: 0,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text
    })
  })
  return words
}

export function TranscriptTimeline({
  segments,
  cuts,
  onChange,
  onSeek,
  sourceMs = 0,
  className
}: TranscriptTimelineProps): JSX.Element {
  const [anchor, setAnchor] = useState<WordRef | null>(null)
  const [focus, setFocus] = useState<WordRef | null>(null)

  const words = flattenWords(segments)

  const selectionSpan =
    anchor && focus
      ? {
          startMs: Math.min(anchor.startMs, focus.startMs),
          endMs: Math.max(anchor.endMs, focus.endMs)
        }
      : null

  const cutSelection = useCallback((): void => {
    if (!selectionSpan) return
    onChange(addManualCut(cuts, selectionSpan))
    setAnchor(null)
    setFocus(null)
  }, [cuts, onChange, selectionSpan])

  const inSelection = (word: WordRef): boolean =>
    selectionSpan !== null &&
    word.startMs >= selectionSpan.startMs &&
    word.endMs <= selectionSpan.endMs

  return (
    <div className={className}>
      {selectionSpan ? (
        <div className="mb-2 flex items-center gap-2 rounded border bg-muted/50 px-2 py-1 text-xs">
          <span>
            {((selectionSpan.endMs - selectionSpan.startMs) / 1_000).toFixed(1)}s selected
          </span>
          <button
            type="button"
            onClick={cutSelection}
            className="flex items-center gap-1 rounded bg-foreground px-2 py-0.5 text-background"
          >
            <Scissors className="h-3 w-3" />
            Cut
          </button>
          <button
            type="button"
            onClick={() => {
              setAnchor(null)
              setFocus(null)
            }}
            className="rounded px-2 py-0.5 hover:bg-muted"
          >
            Clear
          </button>
        </div>
      ) : null}

      <p className="text-sm leading-relaxed">
        {words.map((word) => {
          const isCut = cutAt(word.startMs, cuts) !== null
          const isCurrent = sourceMs >= word.startMs && sourceMs < word.endMs
          return (
            <button
              key={`${word.segmentIndex}-${word.wordIndex}-${word.startMs}`}
              type="button"
              onClick={(event) => {
                if (event.shiftKey && anchor) {
                  setFocus(word)
                  return
                }
                setAnchor(word)
                setFocus(null)
                onSeek?.(word.startMs)
              }}
              className={[
                'rounded px-0.5 text-left',
                isCut ? 'text-muted-foreground/50 line-through' : '',
                isCurrent ? 'bg-primary/20' : '',
                inSelection(word) ? 'bg-primary/30' : 'hover:bg-muted'
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {word.text}{' '}
            </button>
          )
        })}
      </p>

      {words.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No transcript yet. Transcribe this recording to edit by text.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Click a word to jump there. Shift-click a second word to select a span, then cut it.
        </p>
      )}
    </div>
  )
}
