/**
 * @xnetjs/cloud/ai — minimal Server-Sent Events (SSE) parser.
 *
 * OpenRouter's streaming `/chat/completions` returns `data: {json}` lines
 * terminated by `data: [DONE]`, with the final pre-`[DONE]` line carrying the
 * `usage` (incl. `cost`). This decodes a byte stream into the parsed JSON payload
 * of each `data:` line, skipping comments/keepalives and the `[DONE]` sentinel.
 * Pure over an injected `ReadableStream`, so it's testable with no network.
 */

/** Yield the parsed JSON of each `data:` line in an SSE byte stream. */
export async function* parseSseJson(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<unknown, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line; process complete lines.
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        const payload = dataPayload(line)
        if (payload === null) continue
        if (payload === '[DONE]') return
        try {
          yield JSON.parse(payload)
        } catch {
          // ignore a malformed/partial line — robustness over strictness
        }
      }
    }
    // Flush any trailing line without a newline.
    const last = dataPayload(buffer.trim())
    if (last !== null && last !== '[DONE]') {
      try {
        yield JSON.parse(last)
      } catch {
        /* ignore */
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** The text after `data:` for a data line, or null for comments/other fields/blank. */
function dataPayload(line: string): string | null {
  if (!line.startsWith('data:')) return null
  return line.slice(5).trim()
}
