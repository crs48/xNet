/**
 * `xnet bridge serve` — run the agent bridge daemon (exploration 0194).
 *
 * Serves the loopback endpoint XNet's chat panel probes at `:31416` (the
 * `bridge` connector tier), driving the user's OWN coding-agent CLI
 * (`claude` / `codex` / …) as the model. The agent authenticates itself with
 * the user's subscription — xNet never sees the token. This is the missing
 * "thin shell" that makes the bridge tier light up on any surface (Electron or
 * the web deployment talking to a local daemon).
 */

import {
  cliChatAgent,
  createBridgeServer,
  DEFAULT_BRIDGE_PORT,
  NodeCommandRunner,
  type BridgeServerHandle,
  type CommandRunner
} from '@xnetjs/devkit'
import { Command } from 'commander'

export interface BridgeServeOptions {
  /** Agent CLI to drive (default `claude`). */
  agent?: string
  host?: string
  port?: number
  allowOrigin?: string[]
  /** Working directory the agent runs in (default `process.cwd()`). */
  cwd?: string
}

/** Headless arg template for a known agent CLI (falls back to Claude Code's). */
function argsForAgent(command: string): string[] | undefined {
  if (command === 'codex') return ['exec', '{prompt}']
  return undefined // claude / default → cliChatAgent default ['-p', '{prompt}']
}

/** Build (but don't start) the bridge server for the chosen agent. Injectable runner for tests. */
export function buildBridgeServer(
  options: BridgeServeOptions,
  runner: CommandRunner = new NodeCommandRunner()
): BridgeServerHandle {
  const command = options.agent ?? 'claude'
  const args = argsForAgent(command)
  const agent = cliChatAgent(runner, {
    command,
    cwd: options.cwd ?? process.cwd(),
    ...(args ? { args } : {})
  })
  return createBridgeServer({
    agent,
    agentName: command,
    ...(options.host ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(options.allowOrigin ? { allowedOrigins: options.allowOrigin } : {})
  })
}

export function registerBridgeCommand(program: Command): void {
  const bridge = program
    .command('bridge')
    .description("Run the local agent bridge for XNet's AI chat panel")

  bridge
    .command('serve')
    .description('Serve the agent bridge on loopback (default :31416), driving your own agent CLI')
    .option('--agent <command>', 'Agent CLI to drive (claude, codex, …)', 'claude')
    .option('--host <host>', 'Loopback host (default 127.0.0.1)')
    .option('--port <n>', `Port (default ${DEFAULT_BRIDGE_PORT})`, parseIntOption)
    .option(
      '--allow-origin <origin...>',
      'Browser origins permitted (e.g. https://user.github.io for the web deployment)'
    )
    .option('--cwd <dir>', 'Working directory the agent runs in (default current dir)')
    .action(async (options: BridgeServeOptions) => {
      const handle = buildBridgeServer(options)
      await handle.start()
      // stderr so stdout stays clean for any tooling that scrapes it.
      console.error(
        `xNet agent bridge listening on ${handle.url} (agent: ${options.agent ?? 'claude'})`
      )
      console.error('In XNet, open the AI panel and select "Local bridge".')
      const shutdown = (): void => {
        void handle.stop().then(() => process.exit(0))
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`)
  return parsed
}
