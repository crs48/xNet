/**
 * Groundedness spot-check for meeting enhancement (exploration 0394).
 *
 * Two halves, and both matter:
 *  1. the screen itself catches invented specifics on fixtures, and does not
 *     cry wolf on faithful output — a checker with false positives gets muted;
 *  2. the prompt contract that instructs the model still says "never invent",
 *     for every template, so the rule can't be edited away silently.
 */

import type { MeetingSegment } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { buildEnhanceMessages, formatTranscript } from './enhance-notes'
import { screenGroundedness } from './groundedness'
import { listTemplates } from './templates'

const SEGMENTS: MeetingSegment[] = [
  { channel: 'me', text: 'Can we ship the Atlas migration on Friday?', startMs: 0, endMs: 1500 },
  {
    channel: 'them',
    text: 'Only if the review lands. Ana said it needs two more days.',
    startMs: 2000,
    endMs: 4000
  },
  {
    channel: 'me',
    text: 'Fine — target Wednesday, and I will tell Cleo.',
    startMs: 4500,
    endMs: 6000
  }
]

const USER_NOTES = '- ship date?\n- who tells the security team'
const SOURCES = [formatTranscript(SEGMENTS), USER_NOTES]

describe('groundedness screen', () => {
  it('passes output that only uses what the sources contain', () => {
    const faithful = [
      '## Summary',
      'The team moved the Atlas migration from Friday to Wednesday because the review needs two more days.',
      '',
      '## Action items',
      '- Ana: finish the review',
      '- Me: tell Cleo about the new date'
    ].join('\n')

    const report = screenGroundedness(faithful, SOURCES)
    expect(report.unsupportedNames).toEqual([])
    expect(report.unsupportedNumbers).toEqual([])
    expect(report.grounded).toBe(true)
    expect(report.score).toBe(1)
  })

  it('catches an invented name — the commitment nobody made', () => {
    const invented = [
      '## Action items',
      '- Ana: finish the review',
      '- Priya: sign off on the rollout plan'
    ].join('\n')

    const report = screenGroundedness(invented, SOURCES)
    expect(report.unsupportedNames).toContain('Priya')
    expect(report.grounded).toBe(false)
    expect(report.score).toBeLessThan(1)
  })

  it('catches an invented number', () => {
    const invented = '## Summary\nThe migration slipped by 11 days and costs 40% more.'
    const report = screenGroundedness(invented, SOURCES)
    expect(report.unsupportedNumbers).toEqual(expect.arrayContaining(['11']))
    expect(report.grounded).toBe(false)
  })

  it('does not flag headings the template itself mandates', () => {
    const structural = '## Summary\n\n## Decisions\n\n## Action items\n- None discussed.'
    expect(screenGroundedness(structural, SOURCES).grounded).toBe(true)
  })

  it('does not flag a sentence-initial capital', () => {
    // "Wednesday" leads the sentence; capitalization there says nothing.
    const report = screenGroundedness('Shipping moves to Wednesday.', SOURCES)
    expect(report.grounded).toBe(true)
  })

  it('reports a partial score rather than an all-or-nothing verdict', () => {
    const mixed = '- Ana: review\n- Priya: rollout\n- Cleo: comms'
    const report = screenGroundedness(mixed, SOURCES)
    expect(report.score).toBeGreaterThan(0)
    expect(report.score).toBeLessThan(1)
  })
})

describe('enhancement prompt contract', () => {
  it('tells every template never to invent, and how to attribute', () => {
    for (const template of listTemplates()) {
      expect(template.systemPrompt).toContain('Never invent')
      expect(template.systemPrompt).toContain('[me]')
      expect(template.systemPrompt).toContain('[them]')
      // Rule 1: the user's notes are the relevance filter, never dropped.
      expect(template.systemPrompt).toContain('Never drop one')
    }
  })

  it('sends the model both the transcript and the notes it must stay inside', () => {
    const { messages } = buildEnhanceMessages({
      segments: SEGMENTS,
      roughNotes: USER_NOTES,
      templateId: 'generic'
    })
    const all = messages.map((message) => message.content).join('\n')
    expect(all).toContain('Atlas migration')
    expect(all).toContain('who tells the security team')
    expect(messages.some((message) => message.role === 'system')).toBe(true)
  })
})
