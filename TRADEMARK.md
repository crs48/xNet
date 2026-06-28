# xNet Trademark & Brand Usage Policy

> **The code is free. The name keeps things honest.**
> xNet's software is open source (MIT for the core) and the xNet protocol is open
> for anyone to re-implement. This policy is *not* about restricting that — it
> exists so people can tell what is **official xNet** and what is independent, so
> the name stays trustworthy. Adapted from the
> [Model Trademark Guidelines](https://modeltrademarkguidelines.org/) (CC-BY).
>
> **Status:** policy of intent. The "xNet" word mark is held today by the project
> founder; registration is in progress, and the mark will transfer to an
> independent **xNet Foundation** as the project matures (see
> [`GOVERNANCE.md`](./GOVERNANCE.md)). We pre-commit now to licensing it on fair,
> non-discriminatory terms — no single company will be able to weaponize it.

## Marks this policy covers

- The **xNet** word mark.
- The **xNet logo** (the cosmic-X icon and wordmark).
- The **`@xnetjs`** npm scope.

## Our commitment

We want a thriving ecosystem of forks, re-implementations, integrations, hubs, and
apps. You do **not** need our permission for the large majority of honest uses
below. We will never use this policy to stop you from forking the code, running
your own hub, or re-implementing the protocol (Charter §2 "Exit", §6 "Commons").

## Uses that need NO permission

- **Truthful references.** Say that your software is **"compatible with xNet,"**
  **"for xNet,"** **"built on xNet,"** or **"works with xNet."** Use the name to
  refer to the actual project in articles, talks, docs, and comparisons (nominative
  fair use).
- **Redistribute unmodified official builds** under the name xNet.
- **Community.** Run user groups, meetups, tutorials, courses, and conferences
  about xNet, including using "xNet" in the event or group name (e.g. "Berlin xNet
  Meetup"). We will *not* restrict this.
- **Downstream packaging.** Distribute xNet through a package manager or OS distro,
  including with the patches normally needed to build/integrate, and **keep the
  name xNet.** (We will never pull a "rename it or remove our patches" — see the
  Firefox/IceWeasel anti-pattern.)
- **Name-with-suffix for ecosystem packages** is fine: `something-xnet`,
  `xnet-plugin-foo`. (We will not nitpick suffixes — see the Rust 2023 lesson.)

## Uses that DO need permission

Email **trademark@xnet.fyi** for:

- A **product or company name** that contains "xNet" (e.g. naming your company
  "xNet Inc." or your product "xNet Pro").
- A **modified/forked build distributed *under the xNet name*** (forks are welcome —
  just give a materially modified distribution its own name, then say it's
  "compatible with xNet").
- **Domain names or social handles** that contain the mark in a way that could look
  official.
- **Merchandise** using the name or logo.
- Any claim of being **"official," "certified," or "endorsed."**

## The "xNet-compatible" / "xNet Certified" program

Independent implementations of the xNet protocol may describe themselves as
**"xNet-compatible"** — and use the **xNet Certified** mark — if they **pass the
published conformance suite** ([`conformance/`](./conformance), spec
`docs/specs/protocol/`, `xnet/1.0`). This is how "one protocol, many
implementations" stays trustworthy: the mark means *it actually interoperates.*
See [`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md) for how to claim it.

When using the certified mark, on first prominent use include the ® once registered
and the line:

> "xNet is a trademark of the xNet project, used pursuant to the xNet trademark
> policy."

*(Modeled on CNCF's Certified Kubernetes program.)*

## Logo usage

Use the logo **unaltered** — no recoloring, distortion, stretching, or adding
elements. Don't use it as your own app/product icon. Brand assets and clear-space
rules: `xnet.fyi/brand` *(to be published)*.

## npm scope

The **`@xnetjs`** scope is reserved for official packages. Publish forks and
community packages under your own scope (you may use an `xnet`/`-xnet` suffix in the
*package name* to indicate compatibility). Scope disputes are handled per npm's
trademark policy.

## Questions / requests

Email **trademark@xnet.fyi**. We aim to say "yes" wherever we can — this policy
protects users from confusion, not the community from participating.

## Changes

This policy may evolve (e.g. when the mark transfers to the xNet Foundation). Changes
follow [`GOVERNANCE.md`](./GOVERNANCE.md). We will not make it *more* restrictive
without a strong, stated reason.
