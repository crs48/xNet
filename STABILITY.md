# Stability and versioning

**xNet is alpha software.** It is released — the `@xnetjs/*` packages are on
npm, the desktop app is downloadable, the hub image ships — but it is early.
This page says exactly what that means, so you can decide what to build on.

## What the version number means

Very little. Read this page instead.

The `@xnetjs/*` core packages are at **2.x**. That number is a historical
artifact, not a maturity claim: the packages started at `0.0.2` and reached
`2.5.0` through ordinary [Changesets](https://github.com/changesets/changesets)
bumps during early development, before we had any policy about what a major
meant.

**We cannot renumber downward.** npm never permits a version string to be
reused, and since npm 11 `publish` refuses to implicitly move the `latest` tag
backwards. `@xnetjs/core@0.5.0` would be publishable as a string but incoherent
as a release — `npm install @xnetjs/core` would still resolve `2.5.0`. So
rather than fake a number we can't have, we write down the promise.

If the number and this page ever disagree, **this page wins**.

## What carries a compatibility promise

| Surface | Promise |
| --- | --- |
| `@public` exports | Semver-honest. A breaking change requires a major bump. |
| `@beta` / `@alpha` exports | May change in any release. Noted in the changelog, no bump guarantee. |
| `@internal` exports, `*/internal` entrypoints | None. Do not import these. |
| Protocol, wire format, `.xnetpack` | Versioned independently — see below. |

The tiers are recorded in each package's committed API report
(`packages/*/etc/*.api.md`), so a change to the promised surface shows up as a
reviewable diff rather than a surprise.

Today the `@public` surface is deliberately small — the root contract of
`@xnetjs/react` (`XNetProvider`, `useXNet`, `useQuery`, `useMutate`, `useNode`,
`useIdentity`, `ErrorBoundary`, `OfflineIndicator`). **A small promise we keep
is worth more than a large one we don't.** We expect to promote more surface to
`@public` over time, not less.

## What we do not promise

- **Storage-format stability before 1.0.** A release may require a local
  re-index or, in the worst case, a re-import. Export your data first —
  Settings → Export writes a portable `.xnetpack` bundle you own.
- **Uninterrupted sync across a protocol bump.** Peers on different protocol
  versions may refuse to sync until both upgrade.
- **API stability for anything not marked `@public`.**
- **That the demo hub keeps your data.** It has a 10 MB quota and evicts after
  24 hours of inactivity. It is a demo, not a backup.

## Protocol versions are separate from package versions

The wire format has its own version, and it does not track npm semver:

| Constant | Meaning |
| --- | --- |
| `CURRENT_PROTOCOL_VERSION` | The signed change record format |
| `XNET_SYNC_ENVELOPE_VERSION` | The sync envelope |
| `XNET_PROTOCOL_VERSION.id` | The umbrella bundle (e.g. `xnet/1.0`) |
| `XNETPACK_FORMAT_VERSION` | The portable export bundle |

A change to any of these is a **breaking change** and forces a major bump on
the affected packages, enforced in CI. The full normative definition lives in
[`docs/specs/protocol/`](./docs/specs/protocol/).

## Practical advice

- **Pin your versions.** Use exact versions or a narrow range; do not float.
- **Read the [changelog](https://xnet.fyi/changelog) before upgrading.**
- **Export before you upgrade.** `.xnetpack` is yours and is verifiable
  offline.
- **Don't store anything you can't afford to lose** anywhere but a backup you
  control.
- **Tell us what breaks.** Alpha means we can still fix the design, not just
  the bug — that is the one advantage of being here early, and it expires.

## When this changes

We will move to a stated stability tier — and, if it is ever coherent to do so,
a version number that means something — when the `@public` surface has gone a
meaningful stretch without a breaking change, and the protocol has stopped
moving. We would rather arrive there late than claim it early.

---

_Questions: [GitHub Discussions](https://github.com/crs48/xNet/discussions).
See also [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[exploration 0370](./docs/explorations/) for the reasoning behind this policy._
