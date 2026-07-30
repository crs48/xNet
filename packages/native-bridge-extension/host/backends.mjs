/**
 * The two ways the native host answers a chat turn (exploration 0289, Option C).
 *
 * A `Backend` is `{ health(), chat(messages, model?) }` — the same tiny contract
 * the HTTP bridge daemon exposes, minus the transport. The whole point of the
 * native-messaging path is that this contract is reached with NO loopback HTTP
 * port exposed to the browser: the browser talks to the extension, the extension
 * talks to this host over the OS's stdio pipe, and only THEN — if at all — does a
 * local socket get involved.
 *
 * - `cliBackend` spawns the user's own `claude` / `codex` CLI directly. This is
 *   the purest form of Option C: no port anywhere, the strongest origin binding
 *   (the OS gates which extension may even launch this host).
 * - `daemonBackend` forwards to an already-running hardened bridge daemon
 *   (`packages/devkit/src/bridge-server.ts`) over loopback, carrying its pairing
 *   token. That loopback hop is process-to-process on the same machine, initiated
 *   by a trusted native binary — not by a web origin — so it carries none of the
 *   CORS / DNS-rebinding surface the daemon's HTTP front door has to defend
 *   against. Use this to reuse the daemon's richer capabilities (MCP tools,
 *   `POST /run`, the Ollama upstream proxy) behind the same stdio door.
 */

import { execFile } from 'node:child_process'

/** Flatten a chat into a single prompt for a headless CLI (mirrors devkit `flattenChat`). */
export function flattenChat(messages) {
  return messages
    .map((m) => (m.role === 'user' ? m.content : `${m.role}: ${m.content}`))
    .join('\n\n')
}

/**
 * Drive the user's installed coding-agent CLI as the model. Spawning the CLI
 * (rather than reusing its token) is the ToS-safe way to use their subscription —
 * xNet never sees the credential; the CLI authenticates itself.
 */
export function cliBackend(options = {}) {
  const command = options.command ?? 'claude'
  const argsTemplate = options.args ?? ['-p', '{prompt}']
  const cwd = options.cwd ?? process.cwd()
  const timeoutMs = options.timeoutMs ?? 120_000
  // Injectable for tests; defaults to the real child_process spawn.
  const run = options.run ?? defaultRun

  return {
    async health() {
      return { ok: true, agent: command, version: options.version ?? '0.1.0', transport: 'cli' }
    },
    async chat(messages, _model) {
      const prompt = flattenChat(messages)
      // split/join (not replace): the prompt is arbitrary text and String.replace
      // would treat `$&` etc. as special and only swap the first token.
      const args = argsTemplate.map((a) => a.split('{prompt}').join(prompt))
      const { code, stdout, stderr } = await run(command, args, { cwd, timeoutMs })
      if (code !== 0) {
        throw new Error(`agent "${command}" failed (code ${code}): ${(stderr || stdout).trim()}`)
      }
      return stdout.trim()
    }
  }
}

function defaultRun(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0, stdout, stderr })
      }
    )
  })
}

/**
 * Forward to a running hardened bridge daemon over loopback, presenting its
 * per-launch pairing token as the bearer. This is how the native host reuses the
 * daemon we already ship instead of respawning the CLI per turn.
 */
export function daemonBackend(options = {}) {
  const url = (options.url ?? 'http://127.0.0.1:31416').replace(/\/+$/, '')
  const token = options.token ?? ''
  const timeoutMs = options.timeoutMs ?? 120_000
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    async health() {
      const res = await fetchImpl(`${url}/health`, { signal: AbortSignal.timeout(2000) })
      if (!res.ok) throw new Error(`bridge daemon health ${res.status}`)
      return { ...(await res.json()), transport: 'daemon' }
    },
    async chat(messages, model) {
      const res = await fetchImpl(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ messages, ...(model ? { model } : {}), stream: false }),
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (!res.ok) {
        throw new Error(`bridge daemon /v1/chat/completions ${res.status}`)
      }
      const data = await res.json()
      return data?.choices?.[0]?.message?.content?.trim() ?? ''
    }
  }
}
