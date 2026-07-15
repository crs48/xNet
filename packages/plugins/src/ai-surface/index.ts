/**
 * AI surface contract for xNet agent resources, tools, and mutation plans.
 */

// Plugin contributions as AI tools (0194 Phase 2).
export { contributionsAsAiTools } from './contribution-tools'
export type { AiCallableTool } from './contribution-tools'

export type {
  AiAuditEvent,
  AiChangeSet,
  AiContextPack,
  AiContextPackResource,
  AiContextSeed,
  AiJsonSchema,
  AiJsonSchemaType,
  AiMutationPlan,
  AiMutationPlanStatus,
  AiOperation,
  AiExtraTool,
  AiResource,
  AiRiskLevel,
  AiScope,
  AiTargetKind,
  AiToolCallResult,
  AiToolDefinition,
  AiValidationResult
} from './types'
export {
  AI_RISK_LEVELS,
  AI_SCOPES,
  AI_TARGET_KINDS,
  isAiRiskLevel,
  isAiScope,
  isAiTargetKind
} from './types'
export {
  attachAiPlanValidation,
  createAiChangeSet,
  createAiOperation,
  createAiValidationResult,
  parseAiMutationPlan,
  serializeAiMutationPlan,
  validateAiMutationPlan,
  type AiValidator
} from './validation'
export { AiSurfaceService, createAiSurfaceService } from './service'
export { XNET_AGENT_SKILL_MD } from './skill'
export { WRITING_XNET_PLUGINS_SKILL_MD } from './plugin-skill'
export { flattenRowForTsv, toTsv } from './format'
export type {
  AiContextRetriever,
  AiDatabaseMutationApplyResult,
  AiPageMarkdownApplyAdapter,
  AiPageMarkdownApplyAdapterInput,
  AiPageMarkdownApplyAdapterResult,
  AiPageMarkdownApplyResult,
  AiPageMarkdownRollbackResult,
  AiResourceContent,
  AiRetrievedNode,
  AiSearchOptions,
  AiSearchResult,
  AiSurfaceLimits,
  AiSurfaceServiceConfig
} from './service'
export {
  getXNetMarkdownDirectiveSpecs,
  parseXNetPageFrontmatter,
  renderMarkdownLineDiff,
  renderMarkdownReviewDiff,
  stripXNetPageFrontmatter,
  XNET_MARKDOWN_DIRECTIVE_SPECS,
  validateXNetPageMarkdown
} from './page-markdown'
export type {
  XNetMarkdownDiffLine,
  XNetMarkdownDiffLineKind,
  XNetMarkdownDirective,
  XNetMarkdownDirectiveSpec,
  XNetMarkdownReviewDiff,
  XNetPageMarkdownFrontmatter,
  XNetPageMarkdownValidation,
  XNetPageMarkdownValidationOptions
} from './page-markdown'
export {
  blockNoteFragmentToMarkdown,
  createBlockNotePageMarkdownAdapter,
  legacyFragmentToMarkdown,
  replaceXNetPageFragmentWithMarkdown,
  XNET_PAGE_FRAGMENT_FIELD,
  XNET_PAGE_LEGACY_FRAGMENT_FIELD,
  xnetPageFragmentToMarkdown
} from './page-fragment'
export type {
  BlockNotePageMarkdownAdapterOptions,
  XNetPageDocResolver,
  XNetPageFragmentReadOptions,
  XNetPageFragmentWriteOptions
} from './page-fragment'
