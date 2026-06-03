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
  AiResourceContent,
  AiSearchOptions,
  AiSearchResult,
  AiSurfaceLimits,
  AiSurfaceServiceConfig
} from './service'
export {
  parseXNetPageFrontmatter,
  renderMarkdownLineDiff,
  stripXNetPageFrontmatter,
  validateXNetPageMarkdown
} from './page-markdown'
export type {
  XNetMarkdownDirective,
  XNetPageMarkdownFrontmatter,
  XNetPageMarkdownValidation,
  XNetPageMarkdownValidationOptions
} from './page-markdown'
