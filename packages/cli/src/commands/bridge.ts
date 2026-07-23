/**
 * `xnet bridge serve` — run the agent bridge daemon (explorations 0194, 0391).
 *
 * Serves the loopback endpoint xNet's chat panel probes at `:31416` (the
 * `bridge` connector tier), driving the user's OWN coding-agent CLI
 * (`claude` / `codex` / …) as the model. The agent authenticates itself with
 * the user's subscription — xNet never sees the token. This is the missing
 * "thin shell" that makes the bridge tier light up on any surface (Electron or
 * the web deployment talking to a local daemon).
 *
 * Claude Code runs the streaming, session-aware path (live deltas over SSE,
 * `--resume` continuity); other agents stay on the one-shot path. Chat turns
 * run in a dedicated `~/.xnet/agent-home` working directory so bridge sessions
 * never interleave with real coding sessions in repositories.
 *
 * `xnet bridge install` writes a launchd LaunchAgent (macOS) so the daemon
 * starts at login with a stable pairing code — the "always-on daily driver"
 * ergonomic from exploration 0391.
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAgentArgs,
  cliAgentRunner,
  DEFAULT_XNET_ALLOWED_TOOLS,
  XNET_READONLY_ALLOWED_TOOLS,
  cliChatAgent,
  cliStreamingChatAgent,
  createBridgeServer,
  DEFAULT_BRIDGE_PORT,
  defaultXnetGate,
  Git,
  handleBridgeRun,
  mcpConfigFor,
  NodeCommandRunner,
  NodeLineRunner,
  openAiChatAgent,
  type BridgeServerHandle,
  type ChatAgent,
  type CommandRunner,
  type LineRunner
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
  /** Working directory the agent runs in (default `~/.xnet/agent-home`). */
  cwd?: string
  /** Path to an MCP config JSON giving the agent xNet's workspace tools. */
  mcpConfigPath?: string
  /**
   * Allow MUTATING workspace tools (create/update/delete/apply). Off by
   * default: without explicit consent the agent gets the read-only tool tier.
   */
  allowWrites?: boolean
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

/**
 * The dedicated working directory bridge chat turns run in. Claude Code stores
 * sessions per working directory, so giving the bridge its own home keeps chat
 * sessions out of real repositories (and repo sessions out of chats).
 */
export function bridgeAgentHome(home: string = homedir()): string {
  return join(home, '.xnet', 'agent-home')
}

/** Build (but don't start) the bridge server for the chosen agent. Injectable runners for tests. */
export function buildBridgeServer(
  options: BridgeServeOptions,
  runner: CommandRunner = new NodeCommandRunner(),
  lineRunner: LineRunner = new NodeLineRunner()
): BridgeServerHandle {
  const command = options.agent ?? 'claude'
  const cwd = options.cwd ?? bridgeAgentHome()
  // Claude Code speaks stream-json + --resume → the streaming, session-aware
  // agent (exploration 0391). Codex and friends stay on the one-shot template;
  // `--upstream` fronts a raw OpenAI-compatible model server through the bridge.
  let agent: ChatAgent
  if (options.upstream) {
    agent = openAiChatAgent({ baseUrl: options.upstream, model: options.upstreamModel ?? 'llama3.2' })
  } else if (command === 'claude') {
    agent = cliStreamingChatAgent(lineRunner, {
      command,
      cwd,
      ...(options.mcpConfigPath ? { launch: mcpLaunchOptions(options) } : {})
    })
  } else {
    const args = buildAgentArgs(command, {
      ...(options.mcpConfigPath ? mcpLaunchOptions(options) : {})
    })
    agent = cliChatAgent(runner, { command, cwd, args })
  }
  // `--code` enables the agentic dev-loop over HTTP (powerful → opt-in): the
  // coding agent edits in a worktree off the CURRENT directory (not the chat
  // home — code tasks are about the repo you launched the bridge from).
  const codeRoot = options.cwd ?? process.cwd()
  const run = options.code
    ? (request: Parameters<typeof handleBridgeRun>[1]) =>
        handleBridgeRun(
          {
            git: new Git(runner, codeRoot),
            runner,
            agent: cliAgentRunner(runner, { command }),
            gate: defaultXnetGate(),
            worktreeRoot: join(codeRoot, '.xnet', 'agent-worktrees')
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

/** MCP launch wiring: read-only tool tier unless writes were consented to. */
function mcpLaunchOptions(options: BridgeServeOptions): {
  mcpConfigPath?: string
  allowedTools: string | readonly string[]
} {
  return {
    ...(options.mcpConfigPath ? { mcpConfigPath: options.mcpConfigPath } : {}),
    allowedTools: options.allowWrites ? DEFAULT_XNET_ALLOWED_TOOLS : XNET_READONLY_ALLOWED_TOOLS
  }
}

type BridgeServeCliOptions = BridgeServeOptions & { mcp?: boolean; mcpApiUrl?: string }

/** Resolve `--mcp` wiring (a temp MCP config pointing back at this CLI). */
function resolveMcpConfig(options: BridgeServeCliOptions): BridgeServeOptions {
  const resolved: BridgeServeOptions = { ...options }
  // Workspace tools are ON by default for Claude (--no-mcp opts out); other
  // agents load MCP from their own global config, and --upstream has no CLI.
  const wantMcp = options.mcp !== false && (options.agent ?? 'claude') === 'claude' && !options.upstream
  if (wantMcp) {
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
  return resolved
}

// ─── launchd install (macOS login item) ─────────────────────────────────────────

export const LAUNCHD_LABEL = 'fyi.xnet.bridge'

export interface BridgeInstallOptions {
  allowOrigin?: string[]
  token?: string
  port?: number
  agent?: string
}

/** The LaunchAgent plist that keeps the bridge running from login. */
export function launchdPlist(execPath: string, cliPath: string, args: string[]): string {
  const xml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  const programArguments = [execPath, cliPath, ...args]
    .map((arg) => `    <string>${xml(arg)}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`
}

/** The `bridge serve` argv an installed LaunchAgent runs. */
export function installServeArgs(options: BridgeInstallOptions, token: string): string[] {
  const args = ['bridge', 'serve', '--token', token]
  if (options.agent) args.push('--agent', options.agent)
  if (options.port !== undefined) args.push('--port', String(options.port))
  for (const origin of options.allowOrigin ?? []) args.push('--allow-origin', origin)
  return args
}

export function registerBridgeCommand(program: Command): void {
  const bridge = program
    .command('bridge')
    .description("Run the local agent bridge for xNet's AI chat panel")

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
    .option(
      '--cwd <dir>',
      'Working directory the agent runs in (default ~/.xnet/agent-home, so chat sessions stay out of your repos)'
    )
    .option(
      '--upstream <url>',
      'Front a raw OpenAI-compatible server (e.g. http://localhost:11434 for Ollama) instead of a CLI'
    )
    .option('--upstream-model <id>', 'Model id to request from --upstream (default llama3.2)')
    .option('--code', 'Enable POST /run agentic code tasks (worktree → gate → checkpoint/PR)')
    .option('--no-mcp', "Don't give the agent xNet's workspace tools (on by default for claude)")
    .option(
      '--allow-writes',
      'Consent to MUTATING workspace tools (create/update/delete); default is read-only'
    )
    .option(
      '--mcp-api-url <url>',
      'xNet local API URL the MCP server talks to (default http://127.0.0.1:31415)'
    )
    .action(async (options: BridgeServeCliOptions) => {
      const resolved = resolveMcpConfig(options)
      if (!resolved.cwd) mkdirSync(bridgeAgentHome(), { recursive: true })
      const handle = buildBridgeServer(resolved)
      await handle.start()
      // stderr so stdout stays clean for any tooling that scrapes it.
      const toolsNote = resolved.mcpConfigPath
        ? options.allowWrites
          ? ', workspace tools: read + write'
          : ', workspace tools: read-only (--allow-writes to consent to writes)'
        : ''
      console.error(
        `xNet agent bridge listening on ${handle.url} (agent: ${options.agent ?? 'claude'}${toolsNote})`
      )
      // The pairing code the daemon now requires on its data endpoints. Printed
      // here so the user can paste it into the web app's AI settings ("Local
      // bridge" tier) — it is never exposed over HTTP.
      console.error(`Pairing code: ${handle.pairingToken}`)
      console.error(
        'In xNet, open the AI panel, select "Local bridge", and paste the pairing code.'
      )
      const shutdown = (): void => {
        void handle.stop().then(() => process.exit(0))
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
    })

  bridge
    .command('install')
    .description('Install the bridge as a macOS login item (launchd) with a stable pairing code')
    .option('--agent <command>', 'Agent CLI to drive (claude, codex, …)')
    .option('--port <n>', `Port (default ${DEFAULT_BRIDGE_PORT})`, parseIntOption)
    .option(
      '--allow-origin <origin...>',
      'Browser origins permitted (e.g. https://app.xnet.fyi for the web deployment)'
    )
    .option('--token <token>', 'Pin the pairing code (default: generate one and keep it stable)')
    .action(async (options: BridgeInstallOptions) => {
      if (process.platform !== 'darwin') {
        console.error('bridge install currently supports macOS (launchd) only.')
        console.error('Run `xnet bridge serve` under your init system of choice instead.')
        process.exitCode = 1
        return
      }
      // A STABLE token (unlike serve's per-launch default): the LaunchAgent
      // restarts across logins and the browser's stored pairing must survive.
      const token = options.token ?? randomBytes(24).toString('base64url')
      const plistDir = join(homedir(), 'Library', 'LaunchAgents')
      const plistPath = join(plistDir, `${LAUNCHD_LABEL}.plist`)
      mkdirSync(plistDir, { recursive: true })
      mkdirSync(bridgeAgentHome(), { recursive: true })
      writeFileSync(
        plistPath,
        launchdPlist(process.execPath, process.argv[1], installServeArgs(options, token))
      )
      const runner = new NodeCommandRunner()
      await runner.run('launchctl', ['unload', plistPath], { cwd: homedir() })
      const load = await runner.run('launchctl', ['load', '-w', plistPath], { cwd: homedir() })
      if (!load.ok) {
        console.error(`launchctl load failed: ${load.stderr || load.stdout}`)
        process.exitCode = 1
        return
      }
      console.error(`Installed ${plistPath} — the bridge now starts at login.`)
      console.error(`Pairing code (stable): ${token}`)
      console.error(
        'In xNet, open the AI panel, select "Local bridge", and paste the pairing code once.'
      )
    })

  bridge
    .command('uninstall')
    .description('Remove the macOS login item installed by `xnet bridge install`')
    .action(async () => {
      const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
      const runner = new NodeCommandRunner()
      await runner.run('launchctl', ['unload', plistPath], { cwd: homedir() })
      try {
        unlinkSync(plistPath)
        console.error(`Removed ${plistPath}.`)
      } catch {
        console.error(`No LaunchAgent at ${plistPath}; nothing to remove.`)
      }
    })
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`)
  return parsed
}
