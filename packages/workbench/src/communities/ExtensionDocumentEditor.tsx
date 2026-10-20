import type { ExtensionDocumentDraft, ExtensionDocumentDrafts } from './extension-document-drafts'
import type { ExtensionDocumentProjection } from './extension-documents'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { readDocumentDraft, updateDocumentDraft } from './extension-document-drafts'
import { encodeExtensionFailure } from './extension-protocol'
import { inputClass, primaryButton, secondaryButton } from './primitives'

export type DocumentSave = (revision: number, text: string) => Promise<void>
const DraftContext = createContext<{
  drafts: ExtensionDocumentDrafts
  update(document: ExtensionDocumentProjection, patch: Partial<ExtensionDocumentDraft>): void
} | null>(null)

/** Lives outside the guest tree so changing a tab preserves drafts; stopping access clears them. */
export function ExtensionDocumentDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<ExtensionDocumentDrafts>(() => new Map())
  return (
    <DraftContext.Provider
      value={{
        drafts,
        update: (document, patch) =>
          setDrafts((current) => updateDocumentDraft(current, document, patch))
      }}
    >
      {children}
    </DraftContext.Provider>
  )
}

export function ExtensionDocumentEditor({
  document,
  save
}: {
  document: ExtensionDocumentProjection
  save?: DocumentSave
}) {
  const context = useContext(DraftContext)
  if (!context) throw new Error('Document drafts require an active preview session.')
  const { text, revision, dirty, busy, status } = readDocumentDraft(context.drafts, document)
  const update = (patch: Partial<ExtensionDocumentDraft>) => context.update(document, patch)
  const changed = dirty && revision !== document.revision
  return (
    <section
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Approved document editor"
    >
      <p className="text-sm font-medium">Editing: {document.title ?? 'Approved page'}</p>
      <p className="text-xs text-muted-foreground">Page text · plain paragraphs</p>
      {document.editable && save ? (
        <>
          <textarea
            className={`${inputClass} min-h-40`}
            aria-label="Page text"
            maxLength={64000}
            value={text}
            disabled={busy}
            onChange={(event) => {
              update({ text: event.target.value, dirty: true, status: '' })
            }}
          />
          {dirty && (
            <p className="text-xs text-muted-foreground">
              Unsaved changes. Switching pages or tabs keeps your draft. Closing this preview or
              changing data access discards it.
            </p>
          )}
          {changed && (
            <p role="alert" className="text-xs">
              This page changed elsewhere. Reload its text before saving.
            </p>
          )}
          <div className="flex gap-2">
            <button
              className={primaryButton}
              disabled={!dirty || busy || changed}
              onClick={async () => {
                update({ busy: true, status: 'Saving…' })
                try {
                  await save(revision, text)
                  update({ dirty: false, busy: false, status: 'Saved on this device.' })
                } catch (error) {
                  update({ busy: false, status: encodeExtensionFailure(error).message })
                }
              }}
            >
              Save page
            </button>
            <button
              className={secondaryButton}
              disabled={busy || !dirty}
              onClick={() => {
                update({ dirty: false, status: '' })
              }}
            >
              Reload page text
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Editing needs separate permission and a private page containing only plain paragraphs.
          </p>
          <div className="whitespace-pre-wrap text-sm">{document.text}</div>
        </>
      )}
      {status && (
        <p role="status" className="text-xs">
          {status}
        </p>
      )}
    </section>
  )
}
