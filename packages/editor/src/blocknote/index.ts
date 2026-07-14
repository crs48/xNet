/**
 * BlockNote-based editor surface (exploration 0312).
 */
export { XNetEditor, type XNetEditorProps, type XNetEditorCommentsHost } from './XNetEditor'
export {
  XNetThreadStore,
  XNetThreadStoreAuth,
  commentBodyToText,
  textToCommentBody,
  toThreadData,
  type XNetCommentThread,
  type XNetCommentNode,
  type XNetThreadStoreHost
} from './comments/xnet-thread-store'
export {
  XNetEditorHostProvider,
  useEditorHost,
  type XNetEditorHost,
  type DatabaseViewType,
  type TaskViewConfig,
  type TaskViewEmbedType
} from './host-context'
export {
  createXNetSchema,
  xnetSchema,
  xnetBlockSpecs,
  xnetInlineContentSpecs,
  xnetStyleSpecs,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  EDITOR_DOCUMENT_FRAGMENT_FIELD,
  LEGACY_DOCUMENT_FRAGMENT_FIELD,
  XNET_SCHEMA_SPEC_NAMES,
  type XNetSchema,
  type XNetEditorInstance,
  type XNetBlock,
  type XNetPartialBlock
} from './schema'
export {
  legacyFragmentToMarkdown,
  shouldImportLegacyContent,
  markLegacyImportDone,
  LEGACY_IMPORT_FLAG
} from './legacy-import'
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
} from './doc-utils'
export { generateCursorColor, truncateDidLabel } from './presence'
export {
  type TaskMentionSuggestion,
  filterMentionSuggestions,
  getMentionDisplayLabel
} from './specs/mention'
export {
  type HashtagSuggestion,
  filterHashtagSuggestions,
  CREATE_HASHTAG_ID
} from './specs/hashtag'
export {
  type WikilinkTarget,
  parseWikilinkQuery,
  matchWikilinkTargets,
  CREATE_WIKILINK_ID
} from './specs/wikilink'
export { CALLOUT_CONFIGS, type CalloutType, type CalloutConfig } from './callout-config'
export { parseViewConfig } from './specs/database-embed'
export { parseTaskViewConfig } from './specs/task-view-embed'
export { parseStoredPreview } from './specs/rich-link'
