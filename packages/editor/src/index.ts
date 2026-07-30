/**
 * @xnetjs/editor - Collaborative BlockNote-based editor for xNet (0312).
 *
 * Framework-agnostic pieces only; the React editor surface lives in
 * `@xnetjs/editor/react`.
 */

export {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  EDITOR_DOCUMENT_FRAGMENT_FIELD,
  LEGACY_DOCUMENT_FRAGMENT_FIELD
} from './blocknote/constants'
export {
  legacyFragmentToMarkdown,
  shouldImportLegacyContent,
  markLegacyImportDone,
  LEGACY_IMPORT_FLAG
} from './blocknote/legacy-import'
export {
  extractMentionDids,
  mentionsFromDoc,
  extractTagIds,
  tagsFromDoc,
  blockInlineText,
  walkBlocks,
  getPageTasksSnapshot,
  pageTaskIdForBlock,
  type BlockLike,
  type PageTaskSnapshot,
  type PageTaskReferenceSnapshot
} from './blocknote/doc-utils'
