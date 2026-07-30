# xNet Governance

> How decisions get made, who makes them, and how that changes as xNet grows.
> This document is intentionally small. It describes how xNet is run **today** and
> the concrete triggers at which it grows up. It is the operational complement to
> [`docs/CHARTER.md`](./docs/CHARTER.md) (what we promise) and
> [`docs/explorations/0241_[_]_OPEN_COLLECTIVE_FOUNDATION_OR_COMPANY_LEGAL_AND_FUNDING_STRUCTURE.md`](./docs/explorations/0241_[_]_OPEN_COLLECTIVE_FOUNDATION_OR_COMPANY_LEGAL_AND_FUNDING_STRUCTURE.md)
> (where the entity story is heading).

## Today: founder-led (BDFL)

xNet is currently maintained by its founder, who acts as **BDFL** ("benevolent
dictator for life") — the final decision-maker on technical direction, releases,
and what ships. This is honest about the project's size: there is a small number
of maintainers, and pretending otherwise would be theater.

Three things keep BDFL legitimate here:

1. **The right to leave.** The code is MIT and the protocol is open. If you
   disagree with a decision, you can fork the code or re-implement the protocol
   and interoperate. Exit is real (see Charter §2, "Exit").
2. **The right to be heard, on the record.** Anyone affected by an operational
   rule can propose changing it through the
   [Rule Change Proposal process](./docs/RULE_CHANGES.md) and gets a public
   written answer with reasoning, logged in
   [`docs/decisions/rule-changes.md`](./docs/decisions/rule-changes.md).
   Voice is real too.
3. **This document commits to growing past BDFL** on the triggers below.

**Exit alone is not a governance model.** A project whose only answer to
disagreement is "you can leave" loses the disagreement *and* the signal — the
members most sensitive to quality exit first and quietly. Where voice is
missing, disputes skip straight to the expensive moves: forks, litigation,
unilateral operator action. Voice is the cheap move, so it should come first.
The reasoning is in
[exploration 0361](./docs/explorations/0361_[x]_VOICE_AS_THE_COMPLEMENT_TO_EXIT_OSTROM_COLLECTIVE_CHOICE_AND_XNET_GOVERNANCE.md).

## Roles

These tiers exist so the path is legible. Most are aspirational at xNet's current
size — they describe how you climb the ladder as the project grows.

| Role | Can | Becomes this by |
| ---- | --- | --------------- |
| **User** | File issues, ask questions, propose ideas | Using xNet |
| **Contributor** | Open PRs, review, discuss | Landing a PR |
| **Maintainer** | Merge PRs in their area, triage, release | Sustained, high-quality contribution + invitation by existing maintainers (2 maintainers, or the BDFL while there is one) |
| **Steering** *(future)* | Set cross-cutting direction | Created on Trigger 2 below |

Maintainers are listed in [`MAINTAINERS.md`](./MAINTAINERS.md). A maintainer who is
inactive for **12 months** moves to **Emeritus** (a fast path back on return).

## How decisions are made

We prefer the lightest process that works:

1. **Lazy consensus.** For most changes, open a PR or issue. If no one objects
   within a reasonable window (about **72 hours** for non-trivial proposals),
   it's approved. Silence means assent. Be ready to revert.
2. **Consensus-seeking.** For contested or cross-cutting changes, we discuss until
   objections are resolved or clearly outweighed (rough consensus — not a vote
   count, not unanimity).
3. **Tie-break.** While xNet has a BDFL, the BDFL has the final word. Once a
   Steering body exists (Trigger 2), it breaks ties by simple majority and is kept
   an odd size.

Big or breaking changes to the **protocol** (`docs/specs/protocol/`, `xnet/1.0`)
follow a written proposal in `docs/` and require explicit maintainer sign-off,
because other implementations depend on it.

### Changing a rule that binds you

The paths above assume you are already in the room — opening a PR, reviewing,
discussing. Some of our rules bind people who are not: plugin authors,
self-hosters, hub operators, paying customers. For those, there is a third path
that needs no invitation:

**[Rule Change Proposals](./docs/RULE_CHANGES.md)** — a public, written way to
propose changing an enumerated **operational rule** (the humane-patterns gate,
allowed plugin licences, marketplace terms, the Charter's refused rents, the
Moat Register, plan quotas). Anyone affected may file one. Every proposal gets a
public accept / decline / defer **with reasoning within 30 days**, appended to
[`docs/decisions/rule-changes.md`](./docs/decisions/rule-changes.md) — declines
included.

It is deliberately **not a vote and not a veto**: while xNet has a BDFL, the
BDFL still decides. What it removes is the ability to change a rule that binds
other people without saying why, in public, on the record. Protocol changes stay
in [XPP](./docs/specs/protocol/xpp/README.md).

## Contributing & provenance

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Contributions are accepted under the
project's licenses (MIT for the core; FSL for `@xnetjs/cloud`) on an
**inbound = outbound** basis, certified per-commit by the **Developer Certificate
of Origin** (`Signed-off-by:`). xNet does **not** require a CLA or copyright
assignment.

## Code of Conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). Reports
go to the contact listed there.

## Trademark & brand

The xNet name, logo, and `@xnetjs` scope are governed by
[`TRADEMARK.md`](./TRADEMARK.md). The code is free to fork; the name exists to keep
"what's official" legible.

## Succession (bus factor)

If the founder becomes unavailable, maintainership and control of the `@xnetjs`
npm scope, the `xnet.fyi` domain, and the trademark pass to the active maintainers
listed in [`MAINTAINERS.md`](./MAINTAINERS.md), who may continue the project and/or
accelerate the foundation transfer below. Access credentials are documented for at
least one trusted second party. *(Until there is a second maintainer, this is the
founder's explicit intent on record; it becomes operational as soon as
`MAINTAINERS.md` has a second name.)*

## How governance grows (triggers)

Lifted from [exploration 0241](./docs/explorations/0241_[_]_OPEN_COLLECTIVE_FOUNDATION_OR_COMPANY_LEGAL_AND_FUNDING_STRUCTURE.md).
We commit to *acting* on these, not just listing them:

| Trigger | Change |
| ------- | ------ |
| **3+ recurring non-founder maintainers** | Add maintainers to `MAINTAINERS.md` with areas; adopt the two-maintainer-approval rule; BDFL steps back from routine merges |
| **External hub operators / org adoption** | Stand up a **Steering** group; formalize the protocol-RFC process |
| **Ecosystem maturity** (0241 Phase 4) | Transfer trademark + protocol spec + conformance suite to an independent **xNet Foundation**; this document's "BDFL" becomes "Steering Committee" and "maintainers hold the mark" becomes "the Foundation holds the mark" |

## Changing this document

Changes to `GOVERNANCE.md` follow the same decision process above and must be made
in a PR that explains itself. While xNet has a BDFL, the BDFL approves governance
changes; afterward, the Steering body does.
