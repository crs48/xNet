import type { DID } from '../node'
import { expect, it } from 'vitest'
import { PageSchema } from './page'

const author = 'did:key:fixture' as DID
it('accepts old Pages without source relations and private notes with multiple citations', () => {
  const old = PageSchema.create({ title: 'Existing page' }, { createdBy: author })
  expect(PageSchema.validate(old).valid).toBe(true)
  const note = PageSchema.create(
    { title: 'My note', sourceResources: ['video-1', 'repository-2'], visibility: 'private' },
    { createdBy: author }
  )
  expect(PageSchema.validate(note).valid).toBe(true)
  expect(note.sourceResources).toEqual(['video-1', 'repository-2'])
  expect(note.visibility).toBe('private')
  expect(note.publishedAt).toBeUndefined()
})
