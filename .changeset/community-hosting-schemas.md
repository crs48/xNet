---
'@xnetjs/data': minor
---

Add community hosting schemas: `Post` (forum-shaped discussion in a Space, with
`comparePostsForFeed` for pinned-then-chronological ordering), `Course` /
`Lesson` / `LessonProgress`, and `Event` / `Rsvp`.

All additive — no existing export changed. `LessonProgress` is readable only by
the learner and the Space's admins, so completion can never be enumerated across
the membership.
