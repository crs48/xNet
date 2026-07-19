import { describe, expect, it } from 'vitest'
import {
  CourseSchema,
  LessonProgressSchema,
  LessonSchema,
  courseCompletion,
  lessonProgressId
} from './course'

describe('Course / Lesson', () => {
  it('gives lessons a document body and courses none', () => {
    expect(LessonSchema.schema.document).toBe('yjs')
    expect(CourseSchema.schema.document).toBeUndefined()
  })
})

describe('LessonProgress', () => {
  // Charter §3 / exploration 0359: progress is competence feedback for the
  // learner, never standing among peers. If read ever cascades to
  // `spaceMember`, a member can enumerate everyone's completion and the
  // ranking surface Skool has becomes trivial to build.
  it('is private to the learner and the space stewards', () => {
    const read = LessonProgressSchema.schema.authorization?.actions?.read
    expect(read).toMatchObject({ roles: ['owner', 'spaceOwner', 'spaceAdmin'] })
    expect(read).not.toMatchObject({ roles: expect.arrayContaining(['spaceMember']) })
  })

  it('only the learner may update their own progress', () => {
    expect(LessonProgressSchema.schema.authorization?.actions?.update).toMatchObject({
      roles: ['owner']
    })
  })

  it('has a deterministic id so completing twice upserts', () => {
    expect(lessonProgressId('lesson-1', 'did:key:alice')).toBe('lessonprogress:lesson-1:did:key:alice')
    expect(lessonProgressId('l', 'd')).toBe(lessonProgressId('l', 'd'))
  })
})

describe('courseCompletion', () => {
  const lessons = [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]

  it('counts only completed lessons', () => {
    expect(
      courseCompletion(lessons, [
        { lesson: 'l1', completedAt: 5 },
        { lesson: 'l2', completedAt: undefined }
      ] as never)
    ).toEqual({ completed: 1, total: 3 })
  })

  it('treats a zero timestamp as not completed', () => {
    expect(courseCompletion(lessons, [{ lesson: 'l1', completedAt: 0 }] as never)).toEqual({
      completed: 0,
      total: 3
    })
  })

  it('ignores progress rows for lessons outside the course', () => {
    expect(
      courseCompletion(lessons, [{ lesson: 'other-course-lesson', completedAt: 9 }] as never)
    ).toEqual({ completed: 0, total: 3 })
  })

  it('is empty-safe', () => {
    expect(courseCompletion([], [])).toEqual({ completed: 0, total: 0 })
  })
})
