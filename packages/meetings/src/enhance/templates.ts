/**
 * Meeting note templates (exploration 0279, phase 2).
 *
 * A template shapes the post-meeting enhancement: the Granola pattern is
 * "expand the user's rough notes using the transcript", with the user's
 * bullets acting as the relevance filter — so every system prompt shares the
 * same contract (never invent, keep the user's priorities on top) and only
 * the structure guidance differs per meeting type.
 */

import type { MeetingTemplateId } from '@xnetjs/data'
import { MEETING_TEMPLATE_IDS } from '@xnetjs/data'

export interface MeetingTemplate {
  id: MeetingTemplateId
  name: string
  /** One-line description for the template picker. */
  description: string
  /** System prompt for the enhancement call. */
  systemPrompt: string
}

const SHARED_CONTRACT = `You turn a meeting transcript plus the user's rough notes into polished meeting notes.

Rules, in priority order:
1. The user's own notes define what matters — expand and organize around them. Never drop one.
2. Use only what the transcript and the user's notes support. Never invent facts, numbers, names, or commitments.
3. The transcript labels speakers as [me] (the note-taker) and [them] (everyone else on the call). Attribute carefully; if attribution is unclear, stay neutral.
4. Write in clean Markdown. Be concise — notes, not prose.
5. Always end with an "Action items" section listing owner + task, when any were discussed; omit the section if none were.`

const template = (
  id: MeetingTemplateId,
  name: string,
  description: string,
  structure: string
): MeetingTemplate => ({
  id,
  name,
  description,
  systemPrompt: `${SHARED_CONTRACT}\n\nStructure for this meeting type (${name}):\n${structure}`
})

export const MEETING_TEMPLATES: Record<MeetingTemplateId, MeetingTemplate> = {
  generic: template(
    'generic',
    'Generic meeting',
    'Balanced summary for any meeting.',
    `- "Summary" — 2-4 sentences on what the meeting was about and what was decided.
- Topic sections following the user's notes order, each with the key points and decisions.
- "Action items".`
  ),
  '1on1': template(
    '1on1',
    'One-on-one',
    'Personal check-in, feedback, growth topics.',
    `- "Highlights" — the few things worth remembering from this conversation.
- "Feedback" — anything given or received, kept verbatim-faithful.
- "Follow-ups" — topics parked for next time.
- "Action items".`
  ),
  standup: template(
    'standup',
    'Standup',
    'Status round: done, doing, blocked.',
    `- Per person mentioned: "Done", "Doing", "Blocked" bullets (skip empty ones).
- "Blockers" — anything needing escalation, called out separately.
- "Action items".`
  ),
  sales: template(
    'sales',
    'Sales call',
    'Discovery/demo call: needs, objections, next steps.',
    `- "Prospect context" — company, role, and situation as stated.
- "Needs & pain points" — in the prospect's own framing.
- "Objections & answers".
- "Next steps" — commitments on both sides, with dates when given.
- "Action items".`
  ),
  interview: template(
    'interview',
    'Interview',
    'Candidate or user-research interview.',
    `- "Background" — who was interviewed and the context.
- Question/answer sections following the user's notes order, faithful to what was actually said.
- "Signals" — notable strengths/concerns the user flagged in their notes (never add your own judgment).
- "Action items".`
  )
}

/** All templates, in picker order. */
export function listTemplates(): MeetingTemplate[] {
  return MEETING_TEMPLATE_IDS.map((id) => MEETING_TEMPLATES[id])
}

/** Resolve a template id, falling back to `generic` for unknown/free-form ids. */
export function resolveTemplate(id: string | undefined): MeetingTemplate {
  return (id && MEETING_TEMPLATES[id as MeetingTemplateId]) || MEETING_TEMPLATES.generic
}
