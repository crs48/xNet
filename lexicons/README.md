# `fyi.xnet.*` lexicons

The source of truth for every AT Protocol lexicon xNet **mints**. Anything xNet
merely **adopts** (`site.standard.*`, `community.lexicon.*`) is deliberately
absent — copying someone else's schema here would create a second, drifting
authority for it (exploration 0372, _adopt > extend > mint_).

## Why the namespace is `fyi.xnet.*`

NSID authority is the reversed DNS name. `x.net` belongs to IANA, so `net.x.*`
is unclaimable **permanently** — exploration 0372 D2. `xnet.fyi` is ours and
serves the site today.

## Publishing

Lexicons become resolvable in two steps, both of which are **operational**, not
code:

1. A `_lexicon.xnet.fyi` DNS TXT record pointing at the publishing DID:
   ```
   _lexicon.xnet.fyi.  TXT  "did=did:plc:…"
   ```
2. One `com.atproto.lexicon.schema` record per file, in that DID's repo, with
   the NSID as the rkey.

`scripts/atproto/publish-lexicons.mjs` does step 2 and prints exactly what step
1 needs. Run `--dry-run` first; it validates every file without a session.

```bash
node scripts/atproto/publish-lexicons.mjs --dry-run
```

## Layout

Directory structure mirrors the NSID, as the ecosystem does:
`lexicons/fyi/xnet/social/affinity.json` → `fyi.xnet.social.affinity`. The
publish script derives the NSID from the path and asserts it matches the `id`
field, so a misfiled schema fails loudly instead of publishing under a name
nobody can resolve.
