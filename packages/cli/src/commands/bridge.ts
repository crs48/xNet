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

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAgentArgs,
  cliAgentRunner,
  cliChatAgent,
  createBridgeServer,
  DEFAULT_BRIDGE_PORT,
  defaultXnetGate,
  Git,
  handleBridgeRun,
  mcpConfigFor,
  NodeCommandRunner,
  openAiChatAgent,
  type BridgeServerHandle,
  type ChatAgent,
  type CommandRunner
} from '@xnetjs/devkit'
import { Command } from 'commander'

export interface BridgeServeOptions {
  /** Agent CLI to drive (default `claude`). */
  agent?: string
  host?: string
  port?: number
  allowOrigin?: string[]
  /** Pin the pairing token (default: a random per-launch code printed on start). */
  token?: string
  /** Working directory the agent runs in (default `process.cwd()`). */
  cwd?: string
  /** Path to an MCP config JSON giving the agent XNet's workspace tools. */
  mcpConfigPath?: string
  /** Enable `POST /run` — agentic code tasks (worktree → gate → checkpoint/PR). */
  code?: boolean
  /**
   * Front a raw OpenAI-compatible model server (e.g. Ollama at
   * `http://localhost:11434`) instead of a coding-agent CLI, so browser access
   * to it goes through the authenticated, origin-locked bridge.
   */
  upstream?: string
  /** Model id to request from `--upstream` (default `llama3.2`). */
  upstreamModel?: string
}

/** Build (but don't start) the bridge server for the chosen agent. Injectable runner for tests. */
export function buildBridgeServer(
  options: BridgeServeOptions,
  runner: CommandRunner = new NodeCommandRunner()
): BridgeServerHandle {
  const command = options.agent ?? 'claude'
  const cwd = options.cwd ?? process.cwd()
  const args = buildAgentArgs(command, {
    ...(options.mcpConfigPath ? { mcpConfigPath: options.mcpConfigPath } : {})
  })
  // `--upstream` fronts a raw OpenAI-compatible model server through the bridge;
  // otherwise drive the user's own coding-agent CLI.
  const agent: ChatAgent = options.upstream
    ? openAiChatAgent({ baseUrl: options.upstream, model: options.upstreamModel ?? 'llama3.2' })
    : cliChatAgent(runner, { command, cwd, args })
  // `--code` enables the agentic dev-loop over HTTP (powerful → opt-in): the
  // coding agent edits in a worktree off `cwd`, then the gate runs.
  const run = options.code
    ? (request: Parameters<typeof handleBridgeRun>[1]) =>
        handleBridgeRun(
          {
            git: new Git(runner, cwd),
            runner,
            agent: cliAgentRunner(runner, { command }),
            gate: defaultXnetGate(),
            worktreeRoot: join(cwd, '.xnet', 'agent-worktrees')
          },
          request
        )
    : undefined
  return createBridgeServer({
    agent,
    agentName: command,
    ...(run ? { run } : {}),
    ...(options.host ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(options.allowOrigin ? { allowedOrigins: options.allowOrigin } : {}),
    ...(options.token ? { pairingToken: options.token } : {})
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
      'Browser origins permitted (e.g. https://app.xnet.fyi for the web deployment)'
    )
    .option(
      '--token <token>',
      'Pin the pairing code browsers must present (default: a random per-launch code)'
    )
    .option('--cwd <dir>', 'Working directory the agent runs in (default current dir)')
    .option(
      '--upstream <url>',
      'Front a raw OpenAI-compatible server (e.g. http://localhost:11434 for Ollama) instead of a CLI'
    )
    .option('--upstream-model <id>', 'Model id to request from --upstream (default llama3.2)')
    .option('--code', 'Enable POST /run agentic code tasks (worktree → gate → checkpoint/PR)')
    .option('--mcp', "Give the agent XNet's workspace tools via `xnet mcp serve`")
    .option(
      '--mcp-api-url <url>',
      'xNet local API URL the MCP server talks to (default http://127.0.0.1:31415)'
    )
    .action(async (options: BridgeServeOptions & { mcp?: boolean; mcpApiUrl?: string }) => {
      const resolved: BridgeServeOptions = { ...options }
      if (options.mcp) {
        // Point the agent's MCP server at THIS CLI (`node <cli> mcp serve …`), so
        // it resolves without `xnet` needing to be on PATH.
        const spec = {
          command: process.execPath,
          args: [
            process.argv[1],
            'mcp',
            'serve',
            '--api-url',
            options.mcpApiUrl ?? 'http://127.0.0.1:31415'
          ]
        }
        const mcpConfigPath = join(tmpdir(), `xnet-bridge-mcp-${process.pid}.json`)
        writeFileSync(mcpConfigPath, JSON.stringify(mcpConfigFor(spec)))
        resolved.mcpConfigPath = mcpConfigPath
      }
      const handle = buildBridgeServer(resolved)
      await handle.start()
      // stderr so stdout stays clean for any tooling that scrapes it.
      console.error(
        `xNet agent bridge listening on ${handle.url} (agent: ${options.agent ?? 'claude'}${
          options.mcp ? ', workspace tools enabled' : ''
        })`
      )
      // The pairing code the daemon now requires on its data endpoints. Printed
      // here so the user can paste it into the web app's AI settings ("Local
      // bridge" tier) — it is never exposed over HTTP.
      console.error(`Pairing code: ${handle.pairingToken}`)
      console.error('In XNet, open the AI panel, select "Local bridge", and paste the pairing code.')
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
