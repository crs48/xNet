/**
 * Server rung — compile-then-run for Rust/C (exploration 0180).
 *
 * The browser cannot host `rustc`/`clang` (LLVM is hundreds of MB), so polyglot
 * compilation happens on a server exec service: it compiles the source inside a
 * sandbox (gVisor/Firecracker, per the Rust Playground model) and returns either
 * a `.wasm` artifact the client runs locally OR captured stdout. The backend is
 * INJECTED as a {@link ServerExecBackend} so this runtime is deterministically
 * testable without any infrastructure, and self-hosters can wire their own
 * sandbox behind the `cloud-ai` agent-safety harness (allow-list + token cap).
 *
 * Local-first note: only COMPILATION needs the network; the resulting WASM
 * executes on-device, so a Rust/C Lab's output is still computed locally.
 */

import type { LabLanguage, LabRunInput, LabRunResult } from './types'
import { sanitizeValue } from './types'

export interface ServerExecRequest {
  language: LabLanguage
  code: string
  timeoutMs: number
}

export type ServerExecResponse =
  | { kind: 'stdout'; logs: string[]; value?: unknown }
  | { kind: 'wasm'; wasm: Uint8Array; logs?: string[] }
  | { kind: 'error'; error: string }

/** Compiles/executes server-side. Injected; the default web app posts to the hub. */
export interface ServerExecBackend {
  /** Languages this backend can compile/run. */
  supports(language: LabLanguage): boolean
  exec(request: ServerExecRequest): Promise<ServerExecResponse>
}

/** Instantiate + run a returned `.wasm` module locally, capturing its result. */
export type WasmRunner = (wasm: Uint8Array) => Promise<{ value?: unknown; logs?: string[] }>

export interface ServerRuntimeOptions {
  backend: ServerExecBackend
  /** Runs a returned wasm artifact on-device. Optional; stdout responses skip it. */
  wasmRunner?: WasmRunner
}

export function createServerRuntimeRunner(options: ServerRuntimeOptions) {
  return async function runServer(input: LabRunInput): Promise<LabRunResult> {
    const start = Date.now()
    const engine = 'server'
    if (!options.backend.supports(input.language)) {
      return {
        ok: false,
        logs: [],
        error: `Server exec backend does not support ${input.language}`,
        durationMs: Date.now() - start,
        engine
      }
    }

    try {
      const response = await options.backend.exec({
        language: input.language,
        code: input.code,
        timeoutMs: input.timeoutMs ?? 10_000
      })

      if (response.kind === 'error') {
        return {
          ok: false,
          logs: [],
          error: response.error,
          durationMs: Date.now() - start,
          engine
        }
      }

      if (response.kind === 'stdout') {
        return {
          ok: true,
          value: sanitizeValue(response.value),
          logs: response.logs.map((message) => ({ level: 'log', message })),
          durationMs: Date.now() - start,
          engine
        }
      }

      // kind === 'wasm' — run the artifact locally.
      if (!options.wasmRunner) {
        return {
          ok: false,
          logs: (response.logs ?? []).map((message) => ({ level: 'log', message })),
          error: 'Server returned a wasm artifact but no local wasmRunner is configured',
          durationMs: Date.now() - start,
          engine
        }
      }
      const ran = await options.wasmRunner(response.wasm)
      return {
        ok: true,
        value: sanitizeValue(ran.value),
        logs: [...(response.logs ?? []), ...(ran.logs ?? [])].map((message) => ({
          level: 'log',
          message
        })),
        durationMs: Date.now() - start,
        engine
      }
    } catch (err) {
      return {
        ok: false,
        logs: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        engine
      }
    }
  }
}

/**
 * A fetch-based backend that posts to a hub exec endpoint. The endpoint is
 * expected to sit behind the cloud-ai agent-safety harness. `fetchImpl` is
 * injectable for testing.
 */
export function createHttpServerExecBackend(options: {
  endpoint: string
  languages: LabLanguage[]
  token?: string
  fetchImpl?: typeof fetch
}): ServerExecBackend {
  const doFetch = options.fetchImpl ?? fetch
  const supported = new Set(options.languages)
  return {
    supports: (language) => supported.has(language),
    exec: async (request) => {
      const res = await doFetch(options.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
        },
        body: JSON.stringify(request)
      })
      if (!res.ok) {
        return { kind: 'error', error: `Server exec failed: ${res.status}` }
      }
      return (await res.json()) as ServerExecResponse
    }
  }
}
