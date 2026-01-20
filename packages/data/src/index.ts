/**
 * @xnet/data - Yjs CRDT engine, signed updates, document management
 */

// Types
export type {
  XDocument,
  DocumentType,
  DocumentMetadata,
  Block,
  BlockType,
  UpdateBatch
} from './types'

// Document operations
export {
  createDocument,
  loadDocument,
  getDocumentState,
  getStateVector,
  setDocumentTitle,
  setDocumentArchived,
  type CreateDocumentOptions
} from './document'

// Update handling
export {
  signUpdate,
  verifyUpdate,
  applySignedUpdate,
  captureUpdate,
  mergeDocuments,
  getMissingUpdates,
  type SignUpdateOptions
} from './updates'

// Block registry
export {
  registerBlockType,
  createBlock,
  validateBlock,
  getRegisteredBlockTypes,
  type BlockDefinition
} from './blocks/registry'

// Awareness/presence
export {
  createAwareness,
  setLocalPresence,
  clearLocalPresence,
  getRemotePresences,
  getAllPresences,
  onPresenceChange,
  getLocalClientId,
  generateUserColor,
  type UserPresence,
  type CursorPosition,
  type SelectionRange
} from './sync/awareness'

// Re-export Yjs for convenience
export { Doc as YDoc, Map as YMap, Array as YArray, Text as YText, XmlFragment as YXmlFragment } from 'yjs'
