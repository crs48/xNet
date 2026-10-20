import type { ExtensionDocumentProjection } from './extension-documents'
import { useEffect, useState } from 'react'
import { encodeExtensionFailure } from './extension-protocol'
import { inputClass, primaryButton, secondaryButton } from './primitives'

export type DocumentSave = (revision: number, text: string) => Promise<void>
export function ExtensionDocumentEditor({
  document,
  save
}: {
  document: ExtensionDocumentProjection
  save?: DocumentSave
}) {
  const [text, setText] = useState(document.editorText ?? document.text)
  const [revision, setRevision] = useState(document.revision)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!dirty) {
      setText(document.editorText ?? document.text)
      setRevision(document.revision)
    }
  }, [document.revision, document.editorText, document.text, dirty])
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
              setText(event.target.value)
              setDirty(true)
              setStatus('')
            }}
          />
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
                setBusy(true)
                setStatus('Saving…')
                try {
                  await save(revision, text)
                  setDirty(false)
                  setStatus('Saved on this device.')
                } catch (error) {
                  setStatus(encodeExtensionFailure(error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Save page
            </button>
            <button
              className={secondaryButton}
              disabled={busy || !dirty}
              onClick={() => {
                setDirty(false)
                setStatus('')
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
