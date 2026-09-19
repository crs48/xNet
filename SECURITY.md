# Security policy

xNet is open source, so anyone can read the code that guards their data —
including people looking for a way in. This page says how to tell us when you
find one, and what we promise in return.

## Reporting a vulnerability

Email **[security@xnet.fyi](mailto:security@xnet.fyi)**. Please do **not** open a
public issue, discussion or pull request for a security bug.

A useful report says what you found, how to reproduce it, which version or
commit you tested, and what an attacker could do with it. A proof of concept
helps; a polished write-up is not required.

## What you can expect

xNet is founder-led and small. These are promises we can keep, not ones that
sound good:

| Step                           | When                                                     |
| ------------------------------ | -------------------------------------------------------- |
| We acknowledge your report     | Within 3 working days                                    |
| We tell you whether we agree   | Within 10 working days                                   |
| Fix or mitigation, if accepted | Aiming for 90 days; sooner for anything exploited        |
| Public advisory and credit     | When the fix ships, unless you would rather not be named |

If we miss one of these, say so — publicly, if you have to. We would rather
be chased than be quiet.

We practise coordinated disclosure: please give us the window above before
publishing details. If we go silent past it, the finding is yours to publish.

There is no bug bounty today. We will credit you in the advisory and the
changelog.

## Safe harbour

We will not pursue or support legal action against anyone who, in good faith:

- tests only their own accounts, devices and hubs, or ones they have explicit
  permission to test;
- avoids reading, changing or deleting other people's data, and stops and
  tells us if they reach any;
- does not degrade service for others (no denial-of-service, no spam);
- reports what they find to us and gives us reasonable time to fix it.

Self-hosting a hub and attacking your own copy is always in scope and needs
nobody's permission.

## Supported versions

xNet is pre-1.0. Security fixes land on `main` and ship in the next release of
each surface; older releases are not patched.

| Surface                     | Supported                            |
| --------------------------- | ------------------------------------ |
| Web app (`xnet.fyi/app`)    | The deployed version                 |
| Desktop app                 | The latest release                   |
| `@xnetjs/*` packages on npm | The latest published version of each |
| Hub container image         | The latest release tag               |

## What is in scope

Anything that lets someone forge, read or destroy data they should not be able
to: the signed change log and its verification (`packages/sync`,
`packages/core`), cryptography and key handling (`packages/crypto`,
`packages/identity`), hub authorization (`packages/hub`), plugin and agent
sandboxing (`packages/plugins`, `packages/trust`), the desktop update path
(`apps/electron`), and our release pipelines (`.github/workflows`).

Out of scope: findings that need a device the attacker already fully controls,
social engineering of maintainers, volumetric denial of service, and reports
from automated scanners with no demonstrated impact.

## What we already know

We would rather list our gaps than have you discover we hid them. Open work is
tracked in `docs/explorations/` — notably the threat model (0134), change-flow
security (0307) and the supply-chain items in 0463. In short: a compromised
client build can sign anything in its user's name and nothing downstream can
tell; we do not yet ship reproducible builds; and the hosted web app trusts
whoever serves its JavaScript. Reports that sharpen any of these are welcome.

Known production-dependency advisories are held by a ratchet
(`pnpm check:dependency-audit`) against a committed baseline; the number is
meant to fall.
