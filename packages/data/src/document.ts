/**
 * XDocument operations
 */
import * as Y from 'yjs'
import type { XDocument, DocumentType, Block } from './types'

/**
 * Options for creating a new document
 */
export interface CreateDocumentOptions {
  id: string
  workspace: string
  type: DocumentType
  title: string
  createdBy: string
  signingKey: Uint8Array
}

/**
 * Create a new XDocument
 */
export function createDocument(options: CreateDocumentOptions): XDocument {
  const ydoc = new Y.Doc({ guid: options.id, gc: false })

  // Initialize metadata
  const meta = ydoc.getMap('metadata')
  meta.set('title', options.title)
  meta.set('created', Date.now())
  meta.set('updated', Date.now())
  meta.set('createdBy', options.createdBy)
  meta.set('archived', false)

  // Initialize blocks array
  ydoc.getArray('blocks')

  // Initialize root block
  const blocks = ydoc.getMap('blockMap')
  const rootBlock: Block = {
    id: 'root',
    type: 'paragraph',
    parent: '',
    content: new Y.XmlFragment(),
    children: [],
    properties: {}
  }
  blocks.set('root', rootBlock)

  return {
    id: options.id,
    ydoc,
    workspace: options.workspace,
    type: options.type,
    metadata: {
      title: options.title,
      created: Date.now(),
      updated: Date.now(),
      createdBy: options.createdBy,
      archived: false
    }
  }
}

/**
 * Load an XDocument from serialized state
 */
export function loadDocument(
  id: string,
  workspace: string,
  type: DocumentType,
  state: Uint8Array
): XDocument {
  const ydoc = new Y.Doc({ guid: id, gc: false })
  Y.applyUpdate(ydoc, state)

  const meta = ydoc.getMap('metadata')

  return {
    id,
    ydoc,
    workspace,
    type,
    metadata: {
      title: (meta.get('title') as string) ?? 'Untitled',
      icon: meta.get('icon') as string | undefined,
      cover: meta.get('cover') as string | undefined,
      created: (meta.get('created') as number) ?? Date.now(),
      updated: (meta.get('updated') as number) ?? Date.now(),
      createdBy: (meta.get('createdBy') as string) ?? '',
      parent: meta.get('parent') as string | undefined,
      archived: (meta.get('archived') as boolean) ?? false
    }
  }
}

/**
 * Get the current state of a document as a serialized update
 */
export function getDocumentState(doc: XDocument): Uint8Array {
  return Y.encodeStateAsUpdate(doc.ydoc)
}

/**
 * Get the state vector of a document
 */
export function getStateVector(doc: XDocument): Uint8Array {
  return Y.encodeStateVector(doc.ydoc)
}

/**
 * Update document title
 */
export function setDocumentTitle(doc: XDocument, title: string): void {
  const meta = doc.ydoc.getMap('metadata')
  meta.set('title', title)
  meta.set('updated', Date.now())
  doc.metadata.title = title
  doc.metadata.updated = Date.now()
}

/**
 * Archive or unarchive document
 */
export function setDocumentArchived(doc: XDocument, archived: boolean): void {
  const meta = doc.ydoc.getMap('metadata')
  meta.set('archived', archived)
  meta.set('updated', Date.now())
  doc.metadata.archived = archived
  doc.metadata.updated = Date.now()
}
