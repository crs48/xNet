/**
 * Data types for @xnet/data
 */
import * as Y from 'yjs'
import type { SignedUpdate, VectorClock } from '@xnet/core'

/**
 * XDocument represents a collaborative document backed by Yjs
 */
export interface XDocument {
  id: string
  ydoc: Y.Doc
  workspace: string
  type: DocumentType
  metadata: DocumentMetadata
}

/**
 * Supported document types
 */
export type DocumentType = 'page' | 'task' | 'database' | 'canvas'

/**
 * Document metadata stored in the Yjs doc
 */
export interface DocumentMetadata {
  title: string
  icon?: string
  cover?: string
  created: number
  updated: number
  createdBy: string
  parent?: string
  archived: boolean
}

/**
 * Block represents a content block within a document
 */
export interface Block {
  id: string
  type: BlockType
  parent: string
  content: Y.XmlFragment | Y.Map<unknown>
  children: string[]
  properties: Record<string, unknown>
}

/**
 * Supported block types
 */
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'todo'
  | 'code'
  | 'quote'
  | 'divider'
  | 'image'
  | 'embed'
  | 'table'
  | 'callout'
  | 'toggle'

/**
 * Batch of signed updates for a document
 */
export interface UpdateBatch {
  docId: string
  updates: SignedUpdate[]
  vectorClock: VectorClock
}
