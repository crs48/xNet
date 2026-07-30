/**
 * Agent passport files (exploration 0337).
 *
 * `xnet agent enroll` persists the minted passport — the agent's DID, its
 * private signing key, and the operator-delegated UCAN — to
 * `~/.xnet/agents/<name>.json` (0600). `xnet mcp serve --agent <name>` loads
 * it so the serve process signs as the agent; the key never reaches the
 * gateway (OpenClaw/Hermes only ever see the MCP transport).
 */

import { mkdir, readFile, writeFile, chmod, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type AgentPassportFile = {
  name: string
  runtime: 'openclaw' | 'hermes' | 'claude-code' | 'other'
  agentDID: string
  operatorDID: string
  /** The agent's Ed25519 private key, hex. Stays on this machine. */
  agentKeyHex: string
  /** Operator-signed delegation (UCAN JWT). */
  ucan: string
  expiresAt: number
  capabilities: Array<{ with: string; can: string }>
  createdAt: number
}

export function agentPassportDir(): string {
  return process.env.XNET_AGENT_DIR ?? join(homedir(), '.xnet', 'agents')
}

const passportPath = (name: string): string => {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid agent name: ${name} (use letters, digits, - and _)`)
  }
  return join(agentPassportDir(), `${name}.json`)
}

export async function saveAgentPassportFile(file: AgentPassportFile): Promise<string> {
  const dir = agentPassportDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const path = passportPath(file.name)
  await writeFile(path, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 })
  // mkdir/writeFile modes are masked by umask; enforce explicitly.
  await chmod(path, 0o600)
  return path
}

export async function loadAgentPassportFile(name: string): Promise<AgentPassportFile | null> {
  try {
    const raw = await readFile(passportPath(name), 'utf8')
    return JSON.parse(raw) as AgentPassportFile
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function listAgentPassportNames(): Promise<string[]> {
  try {
    const entries = await readdir(agentPassportDir())
    return entries.filter((e) => e.endsWith('.json')).map((e) => e.slice(0, -5))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return new Uint8Array(Buffer.from(clean, 'hex'))
}
