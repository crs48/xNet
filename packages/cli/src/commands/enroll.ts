/**
 * `xnet agent enroll` — mint an Agent Passport (exploration 0337).
 *
 * Generates a fresh `did:key` for an external agent (OpenClaw, Hermes, Claude
 * Code, …) and delegates it a narrow, operator-signed UCAN. The passport is
 * saved to `~/.xnet/agents/<name>.json` (0600) and, when the local API is
 * reachable, recorded as an `AgentPassport` node so the workspace knows the
 * agent exists. Prints ready-to-paste gateway config for both OpenClaw and
 * Hermes — they consume the same MCP surface.
 *
 * The agent key never goes to the gateway: `xnet mcp serve --agent <name>`
 * loads it locally and signs there.
 */

import { getSigningPublicKeyFromPrivate } from '@xnetjs/crypto'
import { agentPassportId } from '@xnetjs/data'
import { createDID, mintAgentPassport } from '@xnetjs/identity'
import { Command } from 'commander'
import { createRemoteAgentBackend } from '../utils/agent-remote.js'
import {
  bytesToHex,
  hexToBytes,
  listAgentPassportNames,
  saveAgentPassportFile,
  type AgentPassportFile
} from '../utils/agent-passport-file.js'

const AGENT_PASSPORT_SCHEMA_IRI = 'xnet://xnet.fyi/AgentPassport@1.0.0'

const RUNTIMES = ['openclaw', 'hermes', 'claude-code', 'other'] as const
type Runtime = (typeof RUNTIMES)[number]

export type EnrollOptions = {
  runtime: Runtime
  space: string[]
  can: string[]
  ttlDays: number
  key?: string
  apiUrl?: string
  auditSpace?: string
  node: boolean
}

export type EnrollResult = {
  passport: AgentPassportFile
  path: string
  nodeCreated: boolean
  snippets: { openclaw: string; hermes: string }
}

/** OpenClaw `mcp.servers` entry (stdio — process isolation, no network surface). */
export const openClawStdioSnippet = (name: string): string =>
  JSON.stringify(
    {
      mcp: {
        servers: {
          xnet: {
            command: 'xnet',
            args: ['mcp', 'serve', '--agent', name],
            transport: 'stdio'
          }
        }
      }
    },
    null,
    2
  )

/** Hermes Agent MCP entry — same server, same stdio contract. */
export const hermesStdioSnippet = (name: string): string =>
  JSON.stringify(
    {
      mcpServers: {
        xnet: { command: 'xnet', args: ['mcp', 'serve', '--agent', name] }
      }
    },
    null,
    2
  )

export async function runEnroll(name: string, options: EnrollOptions): Promise<EnrollResult> {
  const keyHex = options.key ?? process.env.XNET_SIGNING_KEY
  if (!keyHex) {
    throw new Error(
      'Operator signing key required: pass --key <hex> or set $XNET_SIGNING_KEY (an ephemeral operator would break the trust chain)'
    )
  }
  if (options.space.length === 0) {
    throw new Error('At least one --space <id> is required (passports are always scoped)')
  }

  const operatorKey = hexToBytes(keyHex)
  const operatorDID = createDID(getSigningPublicKeyFromPrivate(operatorKey))

  const capabilities = options.space.flatMap((space) =>
    options.can.map((can) => ({ with: `xnet://space/${space}`, can }))
  )

  const grant = mintAgentPassport({
    operatorDID,
    operatorKey,
    capabilities,
    ttlSeconds: options.ttlDays * 24 * 3600
  })

  const passport: AgentPassportFile = {
    name,
    runtime: options.runtime,
    agentDID: grant.agentDID,
    operatorDID,
    agentKeyHex: bytesToHex(grant.agentKey),
    ucan: grant.ucan,
    expiresAt: grant.expiresAt,
    capabilities,
    createdAt: Date.now()
  }
  const path = await saveAgentPassportFile(passport)

  let nodeCreated = false
  if (options.node) {
    try {
      const backend = await createRemoteAgentBackend(
        options.apiUrl ? { apiUrl: options.apiUrl } : {}
      )
      await backend.store.create({
        id: agentPassportId(grant.agentDID),
        schemaId: AGENT_PASSPORT_SCHEMA_IRI,
        properties: {
          ...(options.auditSpace ? { space: options.auditSpace } : {}),
          agentDID: grant.agentDID,
          operatorDID,
          displayName: name,
          runtime: options.runtime,
          ucan: grant.ucan,
          expiresAt: grant.expiresAt,
          status: 'active'
        }
      })
      nodeCreated = true
    } catch {
      // The workspace API being down must not block enrollment; the node can
      // be recorded on the next serve.
    }
  }

  return {
    passport,
    path,
    nodeCreated,
    snippets: { openclaw: openClawStdioSnippet(name), hermes: hermesStdioSnippet(name) }
  }
}

export function registerAgentEnrollCommand(program: Command): void {
  const agent = program
    .command('agent')
    .description('Enroll and manage external agent passports (exploration 0337)')

  agent
    .command('enroll <name>')
    .description('Mint a scoped Agent Passport (own DID + operator-delegated UCAN)')
    .option('--runtime <runtime>', `Agent runtime: ${RUNTIMES.join('|')}`, 'other')
    .option('--space <id...>', 'Space ids the agent may write (repeatable)', [])
    .option('--can <action...>', 'Delegated actions', ['node/create', 'node/update'])
    .option('--ttl-days <n>', 'Passport lifetime in days (rotate weekly)', parseFloatOption, 7)
    .option('--key <hex>', 'Operator Ed25519 signing key (hex); falls back to $XNET_SIGNING_KEY')
    .option('--audit-space <id>', 'Space to home the AgentPassport node in')
    .option('--api-url <url>', 'xNet local API URL (default http://127.0.0.1:31415)')
    .option('--no-node', 'Skip recording the AgentPassport node in the workspace')
    .action(async (name: string, options: EnrollOptions) => {
      if (!RUNTIMES.includes(options.runtime)) {
        throw new Error(`Unknown runtime: ${options.runtime} (use ${RUNTIMES.join('|')})`)
      }
      const result = await runEnroll(name, options)
      console.log(`Agent passport minted: ${result.passport.agentDID}`)
      console.log(`  runtime:  ${result.passport.runtime}`)
      console.log(`  expires:  ${new Date(result.passport.expiresAt).toISOString()}`)
      console.log(`  saved:    ${result.path} (0600 — contains the agent's private key)`)
      console.log(
        `  workspace node: ${result.nodeCreated ? 'recorded' : 'skipped (API unreachable or --no-node)'}`
      )
      console.log('\nCapabilities:')
      for (const cap of result.passport.capabilities) {
        console.log(`  ${cap.can}  ${cap.with}`)
      }
      console.log('\nOpenClaw (~/.openclaw/openclaw.json):\n' + result.snippets.openclaw)
      console.log('\nHermes Agent:\n' + result.snippets.hermes)
      console.log(
        `\nHub: add the operator DID to trustedDids so self-issued tokens are rejected:\n  trustedDids: ["${result.passport.operatorDID}"]`
      )
    })

  agent
    .command('list')
    .description('List enrolled agent passports')
    .action(async () => {
      const names = await listAgentPassportNames()
      if (names.length === 0) {
        console.log('No agent passports enrolled (xnet agent enroll <name> --space <id>)')
        return
      }
      for (const name of names) console.log(name)
    })
}

function parseFloatOption(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid number: ${value}`)
  return parsed
}
