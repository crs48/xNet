#!/usr/bin/env node
/**
 * Generate the extension signing keypair and print the derived ID (0289, C).
 *
 * Run once to mint a stable identity for the spike:
 *   node scripts/gen-extension-key.mjs
 *
 * It writes the base64 public key into `extension/manifest.json` (`key`) so the
 * unpacked extension loads with a fixed ID, prints that ID, and writes the
 * PKCS#8 private key to `extension.pem` (git-ignored) — that private key is only
 * needed to pack a `.crx` for distribution; day-to-day "Load unpacked" dev needs
 * only the public `key` already in the manifest. Idempotent report if a key
 * already exists (pass --force to rotate).
 */

import { generateKeyPairSync } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { crxIdFromKey } from './crx-id.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const manifestPath = join(here, '..', 'extension', 'manifest.json')
const pemPath = join(here, '..', 'extension.pem')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const force = process.argv.includes('--force')

if (manifest.key && !force) {
  console.error(`manifest already has a key → id ${crxIdFromKey(manifest.key)} (pass --force to rotate)`)
  process.exit(0)
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const spkiDer = publicKey.export({ type: 'spki', format: 'der' })
const key = spkiDer.toString('base64')

manifest.key = key
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(pemPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))

console.error(`extension id: ${crxIdFromKey(key)}`)
console.error(`wrote key → ${manifestPath}`)
console.error(`wrote private key → ${pemPath} (git-ignored; needed only to pack a .crx)`)
