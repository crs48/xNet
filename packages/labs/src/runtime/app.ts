/**
 * App rung — DOM-bearing mini-apps in a sandboxed iframe (exploration 0180).
 *
 * Unlike the SES/QuickJS rungs, an App Lab is allowed to render UI and touch
 * the DOM, so it cannot be deterministic and must never feed a computed column.
 * Isolation is the browser's own origin sandbox: a `sandbox="allow-scripts"`
 * iframe with NO `allow-same-origin`, so the frame runs on an opaque origin
 * with no access to the host page's cookies, storage, or DOM. Output/console
 * is relayed back over `postMessage` (the same bridge `IframeWidgetHost` uses).
 *
 * This module is pure (it only BUILDS the document + protocol); the actual
 * frame is mounted by the web app's `LabView`. That keeps `@xnetjs/labs`
 * node-safe and lets the host own frame lifecycle/teardown.
 */

import type { LabRunInput, LabRunResult } from './types'

/** Messages an App Lab frame posts back to its host. */
export type LabFrameMessage =
  | { type: 'lab:log'; level: 'log' | 'info' | 'warn' | 'error'; message: string }
  | { type: 'lab:done'; value: unknown }
  | { type: 'lab:error'; error: string }

/**
 * Build the `srcdoc` for an App Lab frame. The user code runs inside an async
 * IIFE; `console.*` and the return value are relayed to the host. `runId`
 * tags messages so the host can ignore stale frames.
 */
export function buildAppFrameSrcdoc(code: string, runId: string): string {
  const json = JSON.stringify(runId)
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script type="module">
const runId = ${json};
const post = (msg) => parent.postMessage({ ...msg, runId }, '*');
for (const level of ['log', 'info', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    try {
      post({ type: 'lab:log', level, message: args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') });
    } catch { post({ type: 'lab:log', level, message: String(args) }); }
  };
}
(async () => {
  try {
    const value = await (async () => {\n${code}\n})();
    let safe; try { safe = JSON.parse(JSON.stringify(value ?? null)); } catch { safe = String(value); }
    post({ type: 'lab:done', value: safe });
  } catch (err) {
    post({ type: 'lab:error', error: err && err.message ? err.message : String(err) });
  }
})();
</script>
</body></html>`
}

/** The sandbox token set for an App Lab frame. Never includes allow-same-origin. */
export const APP_FRAME_SANDBOX = 'allow-scripts'

/**
 * The App runtime is host-driven (it needs a live iframe), so calling `run()`
 * off-DOM is unsupported. The web app drives the frame directly with
 * `buildAppFrameSrcdoc`; this stub exists so the ladder can advertise the rung.
 */
export async function runApp(_input: LabRunInput): Promise<LabRunResult> {
  return {
    ok: false,
    logs: [],
    error: 'App Labs render in an iframe and must be run by the host (see buildAppFrameSrcdoc)',
    durationMs: 0,
    engine: 'app'
  }
}
