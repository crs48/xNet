/**
 * Selected preview-context helpers for the coding workspace.
 */

import type {
  PreviewSelectedContextMessage,
  SelectedContext
} from '../../../shared/workspace-session'
import { PREVIEW_SELECTED_CONTEXT_MESSAGE_TYPE } from '../../../shared/workspace-session'

export function isPreviewSelectedContextMessage(
  value: unknown
): value is PreviewSelectedContextMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { type?: unknown }
  return candidate.type === PREVIEW_SELECTED_CONTEXT_MESSAGE_TYPE
}

export function buildSelectedContextPrompt(
  context: SelectedContext,
  selectedContextPath: string
): string {
  return [
    'Selected UI context:',
    `- route: ${context.routeId ?? 'unknown'}`,
    `- target: ${context.targetLabel ?? context.targetId ?? 'untagged target'}`,
    `- fileHint: ${context.fileHint ?? 'unknown'}`,
    `- contextFile: ${selectedContextPath}`,
    `- screenshot: ${context.screenshotPath ?? 'not captured yet'}`,
    context.nearbyText ? `- nearbyText: ${context.nearbyText}` : null,
    '',
    'Please improve this UI while keeping the current interaction model.'
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}
