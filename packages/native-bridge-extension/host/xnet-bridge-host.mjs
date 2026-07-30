#!/usr/bin/env node
/**
 * xNet native-messaging host (exploration 0289, Option C).
 *
 * The browser spawns this file as `node xnet-bridge-host.mjs` when the xNet
 * extension calls `chrome.runtime.connectNative('fyi.xnet.bridge')`, and speaks
 * to it over stdin/stdout using length-prefixed JSON frames. There is NO network
 * listener here: the page reaches the local model through the extension → this
 * host → the user's CLI (or a loopback daemon the host itself dials out to). No
 * port is opened to the browser, so there is no CORS surface and no
 * DNS-rebinding surface to defend — the OS gates, by the native-host manifest's
 * `allowed_origins`, which extension is even permitted to launch this process.
 *
 * Backend selection is by environment (set in the manifest or the user's shell):
 *   XNET_BRIDGE_MODE=cli|daemon      (default: cli — no port anywhere)
 *   cli:    XNET_BRIDGE_AGENT=claude|codex|…   XNET_BRIDGE_CWD=<dir>
 *   daemon: XNET_BRIDGE_URL=http://127.0.0.1:31416
 *           XNET_BRIDGE_TOKEN=<pairing code>  |  XNET_BRIDGE_TOKEN_FILE=<path>
 */

import { readFileSync } from 'node:fs'
import { createMessageDecoder, encodeMessage } from './native-messaging.mjs'
import { handleMessage } from './relay.mjs'
import { cliBackend, daemonBackend } from './backends.mjs'

function resolveBackend(env) {
  const mode = env.XNET_BRIDGE_MODE ?? 'cli'
  if (mode === 'daemon') {
    let token = env.XNET_BRIDGE_TOKEN ?? ''
    if (!token && env.XNET_BRIDGE_TOKEN_FILE) {
      try {
        token = readFileSync(env.XNET_BRIDGE_TOKEN_FILE, 'utf8').trim()
      } catch {
        token = ''
      }
    }
    return daemonBackend({
      ...(env.XNET_BRIDGE_URL ? { url: env.XNET_BRIDGE_URL } : {}),
      token
    })
  }
  return cliBackend({
    ...(env.XNET_BRIDGE_AGENT ? { command: env.XNET_BRIDGE_AGENT } : {}),
    ...(env.XNET_BRIDGE_CWD ? { cwd: env.XNET_BRIDGE_CWD } : {})
  })
}

function write(value) {
  process.stdout.write(encodeMessage(value))
}

function main() {
  const backend = resolveBackend(process.env)
  const inFlight = new Set()
  let stdinEnded = false

  const maybeExit = () => {
    // Exit only once the browser has closed the port AND every reply has
    // flushed — exiting on `end` alone would drop a chat still awaiting the CLI.
    if (stdinEnded && inFlight.size === 0) process.exit(0)
  }

  const decoder = createMessageDecoder(
    (msg) => {
      // One request → one reply. handleMessage never rejects.
      const task = handleMessage(msg, backend).then((reply) => {
        write(reply)
        inFlight.delete(task)
        maybeExit()
      })
      inFlight.add(task)
    },
    (err) => {
      // Framing desync / oversize frame: report once and exit so the browser
      // tears down the port rather than us buffering forever.
      try {
        write({ ok: false, error: `framing error: ${err.message}` })
      } finally {
        process.exit(1)
      }
    }
  )

  process.stdin.on('data', (chunk) => decoder.push(chunk))
  // The browser closes stdin to disconnect the port; drain in-flight work first.
  process.stdin.on('end', () => {
    stdinEnded = true
    maybeExit()
  })
  process.stdin.on('error', () => process.exit(1))
}

main()
