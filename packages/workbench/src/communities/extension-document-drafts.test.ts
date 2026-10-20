import type { ExtensionDocumentProjection } from './extension-documents'
import { describe, expect, it } from 'vitest'
import { readDocumentDraft, updateDocumentDraft } from './extension-document-drafts'

const page = (nodeId: string, handle = nodeId): ExtensionDocumentProjection => ({
  nodeId,
  handle,
  revision: 0,
  text: `${nodeId} saved text`,
  editable: true
})

describe('host document drafts', () => {
  it('keeps unsaved text with its page when the guest reuses an editor position', () => {
    const a = page('a'),
      b = page('b')
    const drafts = updateDocumentDraft(new Map(), a, { text: 'A draft', dirty: true })
    expect(readDocumentDraft(drafts, b)).toMatchObject({ text: 'b saved text', dirty: false })
    expect(readDocumentDraft(drafts, a)).toMatchObject({ text: 'A draft', dirty: true })
  })

  it('retains independent drafts when pages or tabs are hidden and revisited', () => {
    const a = page('a'),
      b = page('b')
    const drafts = updateDocumentDraft(
      updateDocumentDraft(new Map(), a, { text: 'A draft', dirty: true }),
      b,
      { text: 'B draft', dirty: true }
    )
    expect(readDocumentDraft(drafts, a).text).toBe('A draft')
    expect(readDocumentDraft(drafts, b).text).toBe('B draft')
  })

  it('keeps the original revision on a dirty page so a concurrent edit remains a conflict', () => {
    const a = page('a')
    const drafts = updateDocumentDraft(new Map(), a, { text: 'Unsaved', dirty: true })
    const updated = { ...a, revision: 1, text: 'Remote edit' }
    expect(readDocumentDraft(drafts, updated)).toMatchObject({ text: 'Unsaved', revision: 0 })
    const reloaded = updateDocumentDraft(drafts, updated, { dirty: false, status: '' })
    expect(readDocumentDraft(reloaded, updated)).toMatchObject({ text: 'Remote edit', revision: 1 })
  })

  it('keeps a pending save disabled across navigation and applies its result to that page only', () => {
    const a = page('a'),
      b = page('b')
    const drafts = updateDocumentDraft(new Map(), a, {
      text: 'Saving A',
      dirty: true,
      busy: true,
      status: 'Saving…'
    })
    expect(readDocumentDraft(drafts, a).busy).toBe(true)
    expect(readDocumentDraft(drafts, b).busy).toBe(false)
    const other = updateDocumentDraft(drafts, b, { text: 'B draft', dirty: true })
    const saved = updateDocumentDraft(other, a, { dirty: false, busy: false, status: 'Saved' })
    expect(readDocumentDraft(saved, b).text).toBe('B draft')
    expect(readDocumentDraft(saved, { ...a, text: 'Saving A', revision: 1 })).toMatchObject({
      text: 'Saving A',
      revision: 1,
      busy: false,
      dirty: false
    })
  })

  it('does not restore drafts or save errors into a new permission session for the same page', () => {
    const a = page('a', 'old-session')
    const drafts = updateDocumentDraft(new Map(), a, {
      text: 'Old draft',
      dirty: true,
      status: 'Save denied'
    })
    expect(readDocumentDraft(drafts, page('a', 'new-session'))).toMatchObject({
      text: 'a saved text',
      dirty: false,
      status: ''
    })
  })

  it('uses the editor projection without flattening paragraph boundaries', () => {
    const a = { ...page('a'), text: 'Projected', editorText: 'Paragraph one\n\nParagraph three' }
    expect(readDocumentDraft(new Map(), a).text).toBe(a.editorText)
  })
})
