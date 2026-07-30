/**
 * Meetings seeder — botless meeting notes + transcripts (exploration 0279).
 *
 * Two linked fixtures per meeting: a `Meeting` (Yjs notes body mixing the
 * user's rough bullets with "AI-enhanced" output) and its `MeetingTranscript`
 * sibling (channel-attributed timed segments, engine provenance). One meeting
 * per built-in template flavor so the template picker, transcript timeline,
 * and Me/Them attribution all have demo data. No audio blobs — audio
 * retention is opt-in and off by default, and the seed honors that.
 */

import type { SeedDoc, SeederModule } from '../types'
import type { DeterministicNodeImportDraft, MeetingSegment } from '@xnetjs/data'
import { MeetingSchema, MeetingTranscriptSchema } from '@xnetjs/data'
import { buildRichPageDoc, type RichBlock } from '../docs/rich-pages'
import { seedId } from '../seed-ids'

export const meetingId = (slug: string): string => seedId('meeting', slug)
export const meetingTranscriptId = (slug: string): string => seedId('meeting-transcript', slug)

interface MeetingFixture {
  slug: string
  title: string
  templateId: string
  /** Minutes after the (stable) base timestamp. */
  startOffsetMin: number
  turns: Array<{ channel: 'me' | 'them'; text: string; seconds: number }>
  notes: RichBlock[]
}

/** Stable base so re-runs converge (no Date.now() — the seed is deterministic). */
const BASE_STARTED_AT = Date.UTC(2026, 5, 15, 15, 0, 0) // 2026-06-15 15:00 UTC

const FIXTURES: MeetingFixture[] = [
  {
    slug: 'standup',
    title: 'Platform standup',
    templateId: 'standup',
    startOffsetMin: 0,
    turns: [
      { channel: 'me', text: 'Quick round — what shipped yesterday?', seconds: 4 },
      {
        channel: 'them',
        text: 'Sync retries landed, and the flaky import test is fixed.',
        seconds: 9
      },
      { channel: 'me', text: 'I am picking up the transcript batching work today.', seconds: 6 },
      {
        channel: 'them',
        text: 'Blocked on the schema review for the new meeting nodes.',
        seconds: 7
      }
    ],
    notes: [
      { kind: 'h', level: 2, text: 'Standup' },
      {
        kind: 'bullets',
        items: ['sync retries ✅', 'import test fixed', 'me: transcript batching']
      },
      { kind: 'callout', type: 'warning', text: 'Blocked: schema review for meeting nodes.' },
      { kind: 'h', level: 2, text: 'Action items' },
      { kind: 'tasks', items: [{ text: 'Unblock schema review (owner: me)', checked: false }] }
    ]
  },
  {
    slug: 'acme-1on1',
    title: '1:1 — Ana',
    templateId: '1on1',
    startOffsetMin: 90,
    turns: [
      { channel: 'me', text: 'How did the on-call week feel?', seconds: 5 },
      {
        channel: 'them',
        text: 'Heavy. The cold-open pager kept firing over the weekend.',
        seconds: 10
      },
      {
        channel: 'me',
        text: 'Let us move one rotation earlier and revisit the alert thresholds.',
        seconds: 8
      },
      {
        channel: 'them',
        text: 'That would help. Also: I would like to own the recorder view work.',
        seconds: 9
      }
    ],
    notes: [
      { kind: 'h', level: 2, text: 'Highlights' },
      {
        kind: 'bullets',
        items: ['on-call week was heavy — pager tuning needed', 'wants to own recorder view']
      },
      { kind: 'h', level: 2, text: 'Action items' },
      {
        kind: 'tasks',
        items: [
          { text: 'Adjust alert thresholds (owner: me)', checked: false },
          { text: 'Hand recorder view to Ana', checked: true }
        ]
      }
    ]
  },
  {
    slug: 'acme-discovery',
    title: 'Acme Corp discovery call',
    templateId: 'sales',
    startOffsetMin: 240,
    turns: [
      { channel: 'me', text: 'What does your team use for meeting notes today?', seconds: 6 },
      {
        channel: 'them',
        text: 'A bot notetaker, but security flagged it — it joins every call as a guest.',
        seconds: 12
      },
      {
        channel: 'me',
        text: 'Ours is botless: capture happens on your machine, transcription can stay fully local.',
        seconds: 11
      },
      {
        channel: 'them',
        text: 'Local-only would clear our review. What is the rollout timeline?',
        seconds: 8
      }
    ],
    notes: [
      { kind: 'h', level: 2, text: 'Prospect context' },
      { kind: 'p', text: 'Acme Corp — security-sensitive; current bot notetaker failed review.' },
      { kind: 'h', level: 2, text: 'Needs & pain points' },
      { kind: 'bullets', items: ['botless capture', 'fully local transcription tier'] },
      { kind: 'h', level: 2, text: 'Action items' },
      {
        kind: 'tasks',
        items: [{ text: 'Send local-first architecture one-pager', checked: false }]
      }
    ]
  }
]

const buildSegments = (fixture: MeetingFixture): MeetingSegment[] => {
  const segments: MeetingSegment[] = []
  let cursorMs = 1_000
  for (const turn of fixture.turns) {
    const endMs = cursorMs + turn.seconds * 1_000
    segments.push({ channel: turn.channel, text: turn.text, startMs: cursorMs, endMs })
    cursorMs = endMs + 1_500 // breathing room between turns
  }
  return segments
}

export const meetingsSeeder: SeederModule = {
  domain: 'meetings',
  label: 'Meetings & transcripts',
  schemaIds: [MeetingSchema._schemaId, MeetingTranscriptSchema._schemaId],
  seed: ({ fixtures }) => {
    const drafts: DeterministicNodeImportDraft[] = []
    const docs: SeedDoc[] = []

    for (const fixture of FIXTURES) {
      const mtgId = meetingId(fixture.slug)
      const trId = meetingTranscriptId(fixture.slug)
      const segments = buildSegments(fixture)
      const durationMs = segments[segments.length - 1].endMs + 1_000

      drafts.push({
        id: mtgId,
        schemaId: MeetingSchema._schemaId,
        properties: {
          title: fixture.title,
          startedAt: BASE_STARTED_AT + fixture.startOffsetMin * 60_000,
          durationMs,
          templateId: fixture.templateId,
          transcript: trId,
          space: fixtures.spaces.org,
          folder: fixtures.folder('notes'),
          tags: [fixtures.tag('docs')]
        }
      })

      drafts.push({
        id: trId,
        schemaId: MeetingTranscriptSchema._schemaId,
        properties: {
          meeting: mtgId,
          fullText: segments.map((s) => s.text).join(' '),
          segments,
          language: 'en',
          engineId: 'parakeet-sherpa',
          modelId: 'parakeet-tdt-0.6b-v2-int8',
          durationMs,
          space: fixtures.spaces.org
        }
      })

      docs.push({
        nodeId: mtgId,
        build: () =>
          buildRichPageDoc(mtgId, MeetingSchema._schemaId, fixture.title, '🎙️', fixture.notes)
      })
    }

    return { drafts, docs }
  }
}
