import type { ChatPreviewNode } from './agent-extension'
import type { ExtensionDocumentProjection } from './extension-documents'
import type { ExtensionSession } from './extension-sandbox'
import type { DocumentSave } from './ExtensionDocumentEditor'
import { ExtensionDocumentEditor } from './ExtensionDocumentEditor'
import { inputClass, secondaryButton } from './primitives'

export function PreviewTree({
  node,
  session,
  documents,
  editors
}: {
  node: ChatPreviewNode
  session: ExtensionSession | null
  documents: readonly ExtensionDocumentProjection[]
  editors: ReadonlyMap<string, DocumentSave>
}) {
  const styles = {
    stack: 'flex flex-col gap-3',
    grid: 'grid gap-3',
    row: 'flex flex-row flex-wrap items-center gap-3',
    card: 'rounded-xl border border-border p-4',
    text: 'whitespace-pre-wrap text-sm leading-6',
    badge: 'inline-block self-start rounded-full bg-muted px-3 py-1 text-xs',
    button: secondaryButton,
    input: inputClass,
    document: '',
    'document-editor': ''
  }
  if (node.type === 'text' && !node.children?.length)
    return <span className={styles.text}>{node.text}</span>
  if (node.type === 'document-editor') {
    const document = documents.find((item) => item.handle === node.handle)
    return document ? (
      <ExtensionDocumentEditor document={document} save={editors.get(document.handle)} />
    ) : (
      <p>Document access is unavailable.</p>
    )
  }
  if (node.type === 'document') {
    const document = documents.find((item) => item.handle === node.handle)
    return (
      <section className="rounded-lg border border-border p-3" aria-label="Approved document">
        <p className="mb-2 text-xs text-muted-foreground">Document · read-only</p>
        <div className="whitespace-pre-wrap text-sm">
          {document?.text ?? 'Document access is unavailable.'}
        </div>
      </section>
    )
  }
  if (node.type === 'button')
    return (
      <button
        data-preview-control={node.id}
        className={`${node.square ? secondaryButton.replace('disabled:opacity-40', '').replace('text-sm', '') : secondaryButton} ${node.square ? 'aspect-square min-h-0 w-full justify-center p-0 text-3xl' : ''}`}
        disabled={node.disabled}
        aria-label={node.label}
        onClick={() => session?.event(node.id!, 'click')}
      >
        {node.text}
        {node.children?.map((child, index) =>
          child.type === 'text' && !child.children?.length ? (
            child.text
          ) : (
            <PreviewTree
              key={index}
              node={child}
              session={session}
              documents={documents}
              editors={editors}
            />
          )
        )}
      </button>
    )
  if (node.type === 'input')
    return (
      <input
        data-preview-control={node.id}
        className={inputClass}
        aria-label={node.label ?? 'Extension input'}
        disabled={node.disabled}
        value={node.value ?? ''}
        placeholder={node.placeholder}
        maxLength={node.maxLength ?? 2000}
        onChange={(event) => session?.event(node.id!, 'input', event.target.value)}
      />
    )
  return (
    <div
      className={styles[node.type]}
      style={
        node.type === 'grid'
          ? { gridTemplateColumns: `repeat(${node.columns ?? 2}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {node.text}
      {node.children?.map((child, index) => (
        <PreviewTree
          key={index}
          node={child}
          session={session}
          documents={documents}
          editors={editors}
        />
      ))}
    </div>
  )
}
