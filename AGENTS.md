# xNet agent guidelines

xNet is a consumer desktop community network: private and group conversations,
public posts, and peer-hosted video and music. The primary app uses Tauri, Rust,
SQLite, iroh, and React/shadcn. This is an early beta, not the retired CRDT SDK.

## Orientation

- `apps/desktop/`: native app and UI. Drive the real app to verify UI changes.
- `crates/`: network, tracker, and browser native-host implementation.
- `deploy/hub/`: configurable tracker/relay, explicit safe build context.
- `extension/`: opt-in Chrome bridge to the desktop peer.
- `site/`: independent Astro consumer site and preserved blog. Install with
  `pnpm --dir site install --frozen-lockfile`; it is not a JS workspace member.
- `docs/`: concise contributor, beta, retention, and migration runbooks.
- `LEGACY.md`: immutable links to the retired code and design history.

## Working conventions

Prefer functional, declarative code. Read neighbors before changing behavior.
Use named and type-only TypeScript imports; no new `any`. Use React composition,
shadcn primitives, and Tailwind where appropriate. Keep existing identifiers stable.
Human-readable branding is **xNet**; machine names are lowercase `xnet`.

A failure must be distinguishable from success. Do not silently swallow corrupt
state, denied access, partial sync, or truncated validation.

Do not weaken signed identity checks, private-room authorization, loopback bridge
credentials, CSP, updater signatures, or file/storage quotas. The tracker never
stores private chat history or media payloads. Bulk transfers and history are
peer-to-peer; the relay can carry bounded live control traffic. Retention is not
backup: an offline last copy is unavailable.

Never overwrite existing profile directories or copy them into build/deploy
contexts. Keep the Tauri application identifier and updater trust root stable
unless an explicit migration is implemented. Electron profiles are incompatible.

## Verification

Use Node 24, pnpm 10.30.3, and the pinned Rust toolchain. `pnpm dev` starts Tauri.
Run `pnpm lint`, `pnpm build`, and `pnpm test` for app changes. Run
`pnpm --dir site build` for site changes. CI builds native installers on macOS,
Windows and Linux, tests real peers and relay/tracker modes, and checks site output.
Native platform dependencies are in CONTRIBUTING.md.

Unit and integration tests are required for core/security changes. Do not add
UI specs; drive the actual native app. Tests must isolate profiles and clean up
only their own processes. Do not claim Windows runtime verification from a
cross-build. New gates need a named consumer, a decidable pass condition, and a
negative control (`--selftest`) with fixtures in memory.

Read `.claude/skills/verification-before-completion/SKILL.md` before claiming
completion, `writing-agent-instructions` when changing guidance, `changelog`
for user-visible changes, and `humanize` for essays. Skill paths are under
`.claude/skills/`; `.agents/skills` points there.

Use conventional commits with descriptive bullets. Never bypass failing checks
caused by your change. PRs need a changelog fragment or `skip-changelog` label.
A merge does not authorize publishing installers or changing update channels.

Accepted wire/public API/security decisions belong in docs/decisions.md with a
`Tripwire:` describing when to reconsider. Preserve historical decisions in the
archive rather than applying old SDK constraints to the new product.

If `graphify-out/graph.json` exists, query it for architecture relationships.
After code changes run `graphify update .` (local generated output stays ignored).
