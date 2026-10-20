import type { ExtensionDocumentProjection } from './extension-documents'

export interface ExtensionDocumentDraft {
  text: string
  revision: number
  dirty: boolean
  busy: boolean
  status: string
}
export type ExtensionDocumentDrafts = ReadonlyMap<string, ExtensionDocumentDraft>

/** Handles belong to one document and one permission session, never a position in the guest tree. */
export function readDocumentDraft(
  drafts: ExtensionDocumentDrafts,
  document: ExtensionDocumentProjection
): ExtensionDocumentDraft {
  const saved = drafts.get(document.handle)
  if (saved?.dirty || saved?.busy) return saved
  return {
    text: document.editorText ?? document.text,
    revision: document.revision,
    dirty: false,
    busy: false,
    status: saved?.status ?? ''
  }
}

export function updateDocumentDraft(
  drafts: ExtensionDocumentDrafts,
  document: ExtensionDocumentProjection,
  patch: Partial<ExtensionDocumentDraft>
): ExtensionDocumentDrafts {
  return new Map(drafts).set(document.handle, { ...readDocumentDraft(drafts, document), ...patch })
}
