/**
 * @xnetjs/slack-compat — Slack `mrkdwn` → GitHub-flavored markdown (exploration 0198).
 *
 * Slack's `mrkdwn` is *not* markdown: links are `<url|label>`, mentions are
 * `<@U123>` / `<#C1|name>` / `<!here>`, bold is single-`*`, strike is single-`~`,
 * and `&`, `<`, `>` arrive HTML-escaped. This is a best-effort, dependency-free
 * translation to GFM (the body shape `ChatMessage.content` expects). It is lossy
 * by design — see exploration 0198, "Fidelity is lossy by construction".
 *
 * The conversion is staged so each transform stays small and independently
 * testable: angle tokens → inline formatting → entity unescape (last, so it
 * can't resurrect angle tokens).
 */

/** Resolve a `<@U123|name>` / `<@U123>` user mention to plain text. */
function renderMention(inner: string): string {
  const label = inner.includes('|') ? inner.slice(inner.indexOf('|') + 1) : inner.slice(1)
  return `@${label}`
}

/** Resolve a `<#C123|name>` / `<#C123>` channel reference to `#name`. */
function renderChannelRef(inner: string): string {
  const label = inner.includes('|') ? inner.slice(inner.indexOf('|') + 1) : inner.slice(1)
  return `#${label}`
}

/** Resolve a `<!here>` / `<!subteam^S1|@grp>` special command. */
function renderSpecial(inner: string): string {
  const body = inner.slice(1)
  if (body === 'here' || body === 'channel' || body === 'everyone') return `@${body}`
  // subteam / date / other: prefer the explicit label after `|`, else the token.
  return body.includes('|') ? body.slice(body.indexOf('|') + 1) : `@${body}`
}

/** Whether a token looks like a URL/scheme (`https:`, `mailto:`, `tel:`, …). */
function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

/**
 * Resolve a `<url|label>` / `<url>` link to a GFM link or bare URL. A token that
 * is neither labelled nor URL-shaped is left as-is (stray angle brackets), since
 * Slack escapes literal `<`/`>` and would never send them raw.
 */
function renderLink(inner: string): string {
  if (inner.includes('|')) {
    const bar = inner.indexOf('|')
    return `[${inner.slice(bar + 1)}](${inner.slice(0, bar)})`
  }
  return looksLikeUrl(inner) ? inner : `<${inner}>`
}

/** Dispatch one `<...>` token to the right renderer by its leading sigil. */
function renderAngleToken(inner: string): string {
  if (inner.startsWith('@')) return renderMention(inner)
  if (inner.startsWith('#')) return renderChannelRef(inner)
  if (inner.startsWith('!')) return renderSpecial(inner)
  return renderLink(inner)
}

/** Replace every `<...>` token; non-token angle brackets are left untouched. */
export function replaceAngleTokens(text: string): string {
  return text.replace(/<([^<>\n]+)>/g, (_match, inner: string) => renderAngleToken(inner))
}

/** `*bold*` → `**bold**`, `~strike~` → `~~strike~~` (Slack's single-char form). */
export function convertInlineFormatting(text: string): string {
  return text
    .replace(/\*(?!\s)([^*\n]+?)\*/g, '**$1**')
    .replace(/(?<![~])~(?!\s|~)([^~\n]+?)~(?!~)/g, '~~$1~~')
}

/** Unescape Slack's HTML entities. `&amp;` is last so it can't double-decode. */
export function unescapeSlackEntities(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** Convert a Slack `mrkdwn` string to GitHub-flavored markdown (best effort). */
export function slackMrkdwnToMarkdown(text: string): string {
  if (!text) return ''
  return unescapeSlackEntities(convertInlineFormatting(replaceAngleTokens(text)))
}
