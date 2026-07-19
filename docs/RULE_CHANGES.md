# Rule Change Proposals (RCP)

> How anyone affected by an xNet operational rule can propose changing it, and
> what we commit to doing about it.
>
> This is the **voice** half of governance. The **exit** half — MIT code, a
> `did:key` you mint, verified `.xnetpack` export, four independent protocol
> kernels — already works. Exit alone is not enough: a project whose only answer
> to disagreement is "you can leave" loses the disagreement *and* the signal
> (Hirschman, *Exit, Voice, and Loyalty*, 1970). This document is the cheaper
> move that should come first.
>
> Background: [exploration 0361](./explorations/0361_[x]_VOICE_AS_THE_COMPLEMENT_TO_EXIT_OSTROM_COLLECTIVE_CHOICE_AND_XNET_GOVERNANCE.md).

## What this is, and what it is not

An RCP is a public, written request to change one of the **operational rules**
enumerated below, answered in public with reasoning, and recorded in
[`docs/decisions/rule-changes.md`](./decisions/rule-changes.md).

It is **not**:

- **A vote.** There is no ballot, no quorum, and no membership roll.
- **A veto.** While xNet has a BDFL, the BDFL still decides
  ([`GOVERNANCE.md`](../GOVERNANCE.md)).
- **A foundation.** The entity path and its triggers live in exploration 0241.
- **A protocol process.** Changes to the wire format, kernels, or conformance
  corpus go through [XPP](./specs/protocol/xpp/README.md), not here.

What changes is that the **path exists**, the **reasoning becomes a record**,
and the **proposer gets an answer**. That is Ostrom's design principle 3 —
"most individuals affected by the operational rules can participate in
modifying the operational rules" — which requires a path, not an election.

## What counts as an operational rule

A rule is **in scope** when all three hold:

1. It **binds people who are not maintainers** — self-hosters, plugin authors,
   paying customers, hub operators.
2. It is **changed by a maintainer commit**, with no external path today.
3. It is **enumerated below.** The list is closed on purpose: an unbounded
   obligation to litigate every preference is not a process anyone can keep.

### In scope

| Rule | Where it lives | Who it binds |
| --- | --- | --- |
| **The humane-patterns gate** — what counts as a dark pattern, and the `humane-ok` escape hatch | [`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs), [`CHARTER.md` §The `humane-ok` escape hatch](./CHARTER.md) | Every contributor and plugin author whose code the gate rejects |
| **Allowed plugin licences** — which SPDX licences may list on the marketplace | `ALLOWED_PLUGIN_LICENSES` in [`packages/plugins/src/ecosystem/license-policy.ts`](../packages/plugins/src/ecosystem/license-policy.ts) | Plugin authors |
| **Marketplace terms** — fees, takedown grounds, ranking neutrality | [`site/src/pages/marketplace-terms.astro`](../site/src/pages/marketplace-terms.astro) | Plugin authors and buyers |
| **The Charter's refused rents and the four tests** | [`CHARTER.md` §6](./CHARTER.md) | Everyone who relies on the promises — the tests gate every new revenue lane |
| **The Moat Register** — which moats we keep and which we refuse | [`ECONOMICS.md` §2](./ECONOMICS.md) | Everyone downstream of a pricing or positioning decision |
| **Plan quotas and limits** | `PLAN_CATALOG` in [`packages/entitlements/src/plans.ts`](../packages/entitlements/src/plans.ts) | Paying customers and self-hosters reading the entitlements contract |

### Explicitly out of scope, with reasons

- **The protocol** (`docs/specs/protocol/`, the four kernels, the conformance
  corpus) — already has a process: [XPP](./specs/protocol/xpp/README.md).
  Filing an RCP against a protocol rule will be redirected there, not ignored.
- **Code review outcomes, roadmap priority, and what ships when.** These are
  decisions, not rules. Use issues and PRs.
- **The Code of Conduct and its enforcement.** Conduct reports have their own
  confidential path ([`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)); a public
  proposal process is the wrong instrument for them.
- **Trademark licensing decisions.** Pre-committed as FRAND in
  [`TRADEMARK.md`](../TRADEMARK.md); the structural answer is the foundation
  transfer staged in exploration 0241, not an RCP.
- **Security embargoes and disclosure timing.** A public proposal process is
  the wrong instrument for an unpatched vulnerability; report those privately
  to the maintainer contact in [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md).
- **This document's own scope list.** In scope by construction — proposing to
  *add* a rule to the table above is itself a valid RCP.

## Who may propose

**Anyone affected.** Explicitly including people who have never contributed
code: self-hosters, plugin authors, hub operators, paying customers, and users
of a downstream fork. You do not need commit access, a merged PR, or an
invitation. Say how the rule affects you — that is the only standing required.

## How to file one

1. Open a **Rule Change Proposal** issue using the
   [`rule-change.yml`](../.github/ISSUE_TEMPLATE/rule-change.yml) template.
2. Name the rule (from the table above), the change you want, who else is
   affected, and what breaks if we do nothing.
3. Discussion happens on the issue, in public.

If your case is stronger as a diff, open a PR and link it — the same process
applies, and a working change is the most persuasive form of the argument
(borrowed from XPP principle 1, "prove it before you spec it").

## What we commit to

**Every RCP gets a public written response within 30 days**, one of:

| Outcome | Meaning |
| --- | --- |
| **Accepted** | The rule changes. The issue links the commit that changes it. |
| **Declined** | The rule stands, **with the reasoning written down**. |
| **Deferred** | Not now, with the reason and — where one exists — the condition that would reopen it. A deferral is a response, not a way to avoid one. |
| **Redirected** | Out of scope here, with a pointer to the right path (usually XPP or an issue). |

Then the outcome and its reasoning are appended to
[`docs/decisions/rule-changes.md`](./decisions/rule-changes.md), which records
**declines as well as acceptances**. A log of only the accepted proposals is
marketing, not a record.

The window is set at 30 days deliberately: a commitment with no staff behind it
should be generous enough to keep. A missed window is worse than no promise, so
if we are going to miss it, "deferred, here is why" is the response.

This is the point of the process rather than a suggestion box. Cooperation is
stabilised by **conditional, reciprocal, enforceable** exchange — not by
openness alone (Kiers et al., *Science* 333:880, 2011, on mycorrhizal
symbiosis; the argument generalises). A path that is never answered is not a
path.

## Why the BDFL still decides

Because the alternative, at xNet's current size, is theatre. `MAINTAINERS.md`
is short and the plugin ecosystem has no community entries yet; standing up an
elected body for a community this size would be a ceremony with no
constituency. [`GOVERNANCE.md`](../GOVERNANCE.md) names the triggers at which
that changes.

What this process removes is the ability to change a rule that binds other
people **without saying why, in public, on the record**. That is a real
constraint, and it is the one that is honest to make today.

## How this grows

| Trigger | Change |
| --- | --- |
| RCPs filed by people outside the maintainer set, sustained over a year | Name RCP editors (as XPP does), so the response commitment does not rest on one person |
| A real plugin-author or hub-operator constituency exists | Consider an advisory council with seats — exploration 0361 option C, deliberately deferred |
| Ecosystem maturity (0241 Phase 4) | The foundation holds the mark and the spec; this process becomes the foundation's |

## See also

- [`GOVERNANCE.md`](../GOVERNANCE.md) — who decides, and the triggers for growing past BDFL
- [`docs/decisions/rule-changes.md`](./decisions/rule-changes.md) — the decision log
- [`docs/CHARTER.md`](./CHARTER.md) — what we promise
- [`docs/ECONOMICS.md`](./ECONOMICS.md) — the Moat Register and the rent/improvement line
- [`docs/specs/protocol/xpp/README.md`](./specs/protocol/xpp/README.md) — protocol proposals
- [exploration 0361](./explorations/0361_[x]_VOICE_AS_THE_COMPLEMENT_TO_EXIT_OSTROM_COLLECTIVE_CHOICE_AND_XNET_GOVERNANCE.md) — the reasoning behind this document
