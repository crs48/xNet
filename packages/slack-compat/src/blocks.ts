/**
 * @xnetjs/slack-compat — Block Kit → markdown (exploration 0198).
 *
 * A best-effort renderer for the Block Kit blocks an integration is likely to
 * send through an incoming webhook or `chat.postMessage` (`header`, `section`,
 * `context`, `divider`). Interactive blocks (`actions`, input elements, modals)
 * have no markdown equivalent and degrade to their text, if any — exploration
 * 0198 parks the original JSON in an `ext:` overlay for richer rendering later.
 *
 * Each block type has its own small renderer, dispatched through a lookup map so
 * the dispatcher stays flat (no growing switch) and every branch is tested.
 */

import type { SlackBlock, SlackContextElement, SlackTextObject } from './types'
import { slackMrkdwnToMarkdown } from './mrkdwn'

/** Render a Slack text object, converting `mrkdwn` but leaving `plain_text` as-is. */
export function renderTextObject(text: SlackTextObject | undefined): string {
  if (!text || !text.text) return ''
  return text.type === 'mrkdwn' ? slackMrkdwnToMarkdown(text.text) : text.text
}

function renderHeader(block: SlackBlock): string {
  const body = renderTextObject(block.text)
  return body ? `## ${body}` : ''
}

function renderSection(block: SlackBlock): string {
  const parts: string[] = []
  const body = renderTextObject(block.text)
  if (body) parts.push(body)
  for (const field of block.fields ?? []) {
    const rendered = renderTextObject(field)
    if (rendered) parts.push(rendered)
  }
  return parts.join('\n')
}

function renderContextElement(element: SlackContextElement): string {
  if (typeof element.text !== 'string') return ''
  return element.type === 'mrkdwn' ? slackMrkdwnToMarkdown(element.text) : element.text
}

function renderContext(block: SlackBlock): string {
  const parts = (block.elements ?? []).map(renderContextElement).filter(Boolean)
  return parts.length ? `_${parts.join(' ')}_` : ''
}

function renderDivider(): string {
  return '---'
}

/** Fallback for blocks we don't model: surface their `text`, if any. */
function renderUnknown(block: SlackBlock): string {
  return renderTextObject(block.text)
}

const BLOCK_RENDERERS: Record<string, (block: SlackBlock) => string> = {
  header: renderHeader,
  section: renderSection,
  context: renderContext,
  divider: renderDivider
}

/** Render a single block to markdown (empty string if it has no renderable text). */
export function blockToMarkdown(block: SlackBlock): string {
  const renderer = BLOCK_RENDERERS[block.type] ?? renderUnknown
  return renderer(block)
}

/**
 * Render a Block Kit block array to markdown. Returns `undefined` when there are
 * no blocks or none produced any text, so callers can fall back to `attachments`
 * or `text`.
 */
export function blockKitToMarkdown(blocks: SlackBlock[] | undefined): string | undefined {
  if (!blocks || blocks.length === 0) return undefined
  const rendered = blocks.map(blockToMarkdown).filter(Boolean)
  return rendered.length ? rendered.join('\n\n') : undefined
}
