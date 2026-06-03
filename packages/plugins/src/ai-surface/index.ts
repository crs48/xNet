/**
 * AI surface contract for xNet agent resources, tools, and mutation plans.
 */

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
export type {
  AiDatabaseMutationApplyResult,
  AiPageMarkdownApplyAdapter,
  AiPageMarkdownApplyAdapterInput,
  AiPageMarkdownApplyAdapterResult,
  AiPageMarkdownApplyResult,
  AiPageMarkdownRollbackResult,
  AiResourceContent,
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
