/**
 * Course / Lesson / LessonProgress — structured teaching inside a Space (0359).
 *
 * The "classroom" half of a community. A Course groups ordered Lessons; a
 * Lesson is a Page-like document (Y.Doc body) plus its position.
 *
 * **Progress is private to the learner and never ranked.** `LessonProgress`
 * records only that *this person* completed *this lesson*, and its
 * authorization makes it readable by its owner and space admins — not by the
 * membership. There is deliberately no completion percentage leaderboard, no
 * cohort ranking, and no "X% of members finished" comparison surface: under
 * Charter §3 progress is competence feedback for the learner, not standing
 * among peers (exploration 0359). Levels-gate-content, Skool's mechanic, is
 * exactly what this refuses.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { allow, role } from '../../auth'
import { checkbox, created, createdBy, number, relation, text } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const COURSE_SCHEMA_IRI = 'xnet://xnet.fyi/Course@1.0.0'
export const LESSON_SCHEMA_IRI = 'xnet://xnet.fyi/Lesson@1.0.0'
export const LESSON_PROGRESS_SCHEMA_IRI = 'xnet://xnet.fyi/LessonProgress@1.0.0'

export const CourseSchema = defineSchema({
  name: 'Course',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text({ required: true, maxLength: 300 }),
    description: text({ maxLength: 2000 }),
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),
    icon: text({ maxLength: 500 }),
    /** Order among sibling courses — fractional index, code-unit compare. */
    sortKey: text({ maxLength: 500 }),
    /** Unpublished courses are visible to space admins only. */
    published: checkbox({ default: false }),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  authorization: spaceCascadeAuthorization()
})

export const LessonSchema = defineSchema({
  name: 'Lesson',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text({ required: true, maxLength: 300 }),
    course: relation({ target: 'xnet://xnet.fyi/Course@1.0.0' as const, required: true }),
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),
    /** Order within the course — fractional index. */
    sortKey: text({ maxLength: 500 }),
    /** Optional estimated minutes, shown as guidance, never as a timer. */
    estimatedMinutes: number({ min: 0 }),
    createdAt: created(),
    createdBy: createdBy()
  },
  // Lesson bodies are documents, same editor surface as Page/Post.
  document: 'yjs',
  authorization: spaceCascadeAuthorization()
})

/**
 * One learner's completion of one lesson.
 *
 * Deterministic id (see {@link lessonProgressId}) so marking complete twice
 * upserts rather than duplicating. Read is restricted to the learner and the
 * space's admins — a member cannot enumerate another member's progress.
 */
export const LessonProgressSchema = defineSchema({
  name: 'LessonProgress',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    lesson: relation({ target: 'xnet://xnet.fyi/Lesson@1.0.0' as const, required: true }),
    course: relation({ target: 'xnet://xnet.fyi/Course@1.0.0' as const }),
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),
    /** ms since epoch; absent = started but not finished. */
    completedAt: number({}),
    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Written out rather than derived from the space cascade, because the whole
  // point is that it does NOT cascade read to the membership.
  authorization: {
    roles: {
      owner: role.creator(),
      spaceOwner: role.relation('space', 'spaceOwner'),
      spaceAdmin: role.relation('space', 'spaceAdmin'),
      spaceMember: role.relation('space', 'spaceMember')
    },
    actions: {
      // Private by construction: the learner and the space's stewards, and
      // nobody else. There is no membership-wide read of someone's progress.
      read: allow('owner', 'spaceOwner', 'spaceAdmin'),
      create: allow('spaceOwner', 'spaceAdmin', 'spaceMember'),
      update: allow('owner'),
      delete: allow('owner', 'spaceOwner', 'spaceAdmin'),
      write: allow('owner'),
      share: allow('owner')
    }
  }
})

export type Course = InferNode<(typeof CourseSchema)['_properties']>
export type Lesson = InferNode<(typeof LessonSchema)['_properties']>
export type LessonProgress = InferNode<(typeof LessonProgressSchema)['_properties']>

/** Deterministic progress id so completing twice upserts. */
export function lessonProgressId(lessonId: string, learnerDid: string): string {
  return `lessonprogress:${lessonId}:${learnerDid}`
}

/**
 * A learner's own completion count for a course.
 *
 * Returns the learner's numbers only — it takes one person's rows, so there is
 * no shape here that could become a ranking of members.
 */
export const courseCompletion = (
  lessons: readonly Pick<Lesson, 'id'>[],
  ownProgress: readonly Pick<LessonProgress, 'lesson' | 'completedAt'>[]
): { completed: number; total: number } => {
  const done = new Set(
    ownProgress.filter((p) => typeof p.completedAt === 'number' && p.completedAt > 0).map((p) => p.lesson)
  )
  return {
    completed: lessons.filter((l) => done.has(l.id)).length,
    total: lessons.length
  }
}
