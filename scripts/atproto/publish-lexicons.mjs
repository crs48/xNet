#!/usr/bin/env node
/**
 * Publish `lexicons/fyi/xnet/**` as `com.atproto.lexicon.schema` records
 * (explorations 0372/0420).
 *
 * Lexicon resolution needs two halves and this script owns exactly one of
 * them. The other is a DNS TXT record only a human with registrar access can
 * write, so the script prints it rather than pretending it is done.
 *
 * Usage:
 *   node scripts/atproto/publish-lexicons.mjs --dry-run
 *   node scripts/atproto/publish-lexicons.mjs --pds https://bsky.social \
 *        --did did:plc:… --token "$ATPROTO_ACCESS_TOKEN"
 *
 * Zero-dep. `--dry-run` needs no credentials and no network: it validates
 * every file and prints what WOULD be written, which is the mode CI runs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../lexicons', import.meta.url))
const SCHEMA_COLLECTION = 'com.atproto.lexicon.schema'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const dryRun = args.includes('--dry-run')

/** Every `.json` under `lexicons/`, depth-first, sorted for stable output. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (entry.endsWith('.json')) out.push(path)
  }
  return out
}

/**
 * The NSID a file's PATH claims. Asserting this against the `id` field is the
 * whole point of mirroring the namespace in the directory layout: a misfiled
 * schema fails here instead of publishing under a name nobody can resolve.
 */
function nsidFromPath(path) {
  return relative(ROOT, path).replace(/\.json$/, '').split(sep).join('.')
}

const files = walk(ROOT)
if (files.length === 0) {
  console.error(`[lexicons] no schemas found under ${ROOT}`)
  process.exit(1)
}

const records = []
const problems = []
for (const path of files) {
  const rel = relative(ROOT, path)
  let doc
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    problems.push(`${rel}: not valid JSON — ${err.message}`)
    continue
  }
  const expected = nsidFromPath(path)
  if (doc.lexicon !== 1) problems.push(`${rel}: "lexicon" must be 1, got ${doc.lexicon}`)
  if (doc.id !== expected) problems.push(`${rel}: id "${doc.id}" does not match path "${expected}"`)
  if (!doc.defs || typeof doc.defs !== 'object') problems.push(`${rel}: missing "defs"`)
  // Authority over an NSID is authority over the reversed DNS name. We hold
  // xnet.fyi and nothing else; `net.x.*` in particular belongs to IANA (0372 D2).
  if (!expected.startsWith('fyi.xnet.')) {
    problems.push(`${rel}: "${expected}" is outside fyi.xnet.* — we cannot publish a namespace we do not own`)
  }
  records.push({ rkey: expected, value: { ...doc, $type: SCHEMA_COLLECTION } })
}

if (problems.length > 0) {
  console.error('[lexicons] refusing to publish:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

console.log(`[lexicons] ${records.length} schema(s) valid:`)
for (const r of records) console.log(`  ${r.rkey}`)

const did = flag('did')
console.log(
  `\n[lexicons] DNS half (do this once, by hand):\n` +
    `  _lexicon.xnet.fyi.  TXT  "did=${did ?? '<publishing-did>'}"\n` +
    `  Without it, resolvers cannot find these records and the publish is inert.`
)

if (dryRun) {
  console.log('\n[lexicons] --dry-run: nothing written.')
  process.exit(0)
}

const pds = flag('pds')
const token = flag('token')
if (!pds || !did || !token) {
  console.error('\n[lexicons] --pds, --did and --token are all required to write. Or pass --dry-run.')
  process.exit(1)
}

let written = 0
for (const record of records) {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.putRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      repo: did,
      collection: SCHEMA_COLLECTION,
      rkey: record.rkey,
      record: record.value
    })
  })
  if (!res.ok) {
    // Loud and immediate: a half-published lexicon set is worse than none,
    // because resolution succeeds for some names and silently fails for others.
    console.error(`[lexicons] ${record.rkey}: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  written++
  console.log(`[lexicons] wrote ${record.rkey}`)
}
console.log(`\n[lexicons] published ${written}/${records.length}.`)
